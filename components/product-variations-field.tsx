"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Layers, Plus, Trash2, X } from "@/components/icons";
import { photoSrc, type PhotoSlot } from "@/components/product-photos-field";
import {
  MAX_OPTIONS_PER_GROUP, MAX_VARIANTS, MAX_VARIATION_GROUPS, VARIATION_OPTION_MAX, buildRows, cleanText, optionError,
  variantKey, variationTotals, type VariantValues, type VariationGroup,
} from "@/lib/product-variations";
import {
  COLORS, FREE_TEXT_MAX, MATERIALS, SIZE_LETTERS, TYPE_HINT, TYPE_KIND, VARIATION_TYPES, checkOption, isVariationType,
  lengthOption, measureFrom, measureOption, nearestColor, quantityFrom, quantityOption, type VariationType,
} from "@/lib/variation-catalog";

export type VariationsState = {
  enabled: boolean;
  groups: VariationGroup[];
  /** Preço e estoque por combinação (chave de variantKey). */
  values: Record<string, VariantValues>;
  /** Foto escolhida para cada opção da 1ª variação (id da foto em PhotoSlot). */
  images: Record<string, string>;
};

export const EMPTY_VARIATIONS: VariationsState = { enabled: false, groups: [], values: {}, images: {} };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Variações da peça no mesmo cadastro (como nos grandes marketplaces):
 * 1) habilitar; 2) escolher o tipo (Cor, Tamanho...) e as opções; 3) opcionalmente
 * uma 2ª variação; 4) preço e estoque de cada combinação na tabela. Sem SKU/GTIN.
 */
export function ProductVariationsField({ value, onChange, photos, disabled = false }: {
  value: VariationsState;
  onChange: (next: VariationsState) => void;
  photos: readonly PhotoSlot[];
  disabled?: boolean;
}) {
  const id = useId();
  const [drafts, setDrafts] = useState<string[]>(["", ""]);
  const [draftErrors, setDraftErrors] = useState<string[]>(["", ""]);
  // Medida (largura × altura) do tipo Tamanho, por variação.
  const [measures, setMeasures] = useState([{ width: "", height: "" }, { width: "", height: "" }]);
  // Seletor de cor: o que foi escolhido e o nome da paleta associado.
  const [picked, setPicked] = useState<Array<{ hex: string; name: string } | null>>([null, null]);
  const [bulk, setBulk] = useState({ price: "", stock: "" });
  const rows = buildRows(value.groups, value.values);
  const totals = variationTotals(rows);
  const twoLevels = value.groups.length === 2;

  function update(patch: Partial<VariationsState>) {
    onChange({ ...value, ...patch });
  }

  function setGroup(index: number, group: VariationGroup) {
    update({ groups: value.groups.map((current, position) => (position === index ? group : current)) });
  }

  function enable() {
    update({ enabled: true, groups: value.groups.length ? value.groups : [{ name: "", options: [] }] });
  }

  function disable() {
    if (rows.length && !window.confirm("Remover as variações desta peça? Preço e estoque voltam a ser um só.")) return;
    setDrafts(["", ""]);
    onChange({ ...EMPTY_VARIATIONS });
  }

  function setDraftError(index: number, message: string) {
    setDraftErrors((current) => current.map((item, position) => (position === index ? message : item)));
  }

  function addOption(index: number, raw = drafts[index]) {
    const group = value.groups[index];
    if (!group) return false;
    const result = optionError(group, raw);
    setDraftError(index, result.error ?? "");
    if (result.error !== null) return false;
    setGroup(index, { ...group, options: [...group.options, result.option] });
    setDrafts((current) => current.map((draft, position) => (position === index ? "" : draft)));
    return true;
  }

  /** Lista fechada (cor, material, letras de tamanho): marca ou desmarca. */
  function toggleOption(index: number, option: string) {
    const group = value.groups[index];
    if (!group) return;
    const existing = group.options.find((item) => item.toLowerCase() === option.toLowerCase());
    if (existing) {
      setDraftError(index, "");
      removeOption(index, existing);
    } else addOption(index, option);
  }

  /** Cor escolhida no seletor: associa ao nome mais parecido da paleta e marca essa cor. */
  function pickColor(index: number, hex: string) {
    const color = nearestColor(hex);
    if (!color) return;
    setPicked((current) => current.map((item, position) => (position === index ? { hex, name: color.name } : item)));
    const group = value.groups[index];
    if (group && !group.options.some((item) => item.toLowerCase() === color.name.toLowerCase())) addOption(index, color.name);
    else setDraftError(index, "");
  }

  /** Número digitado (comprimento, quantidade, numeração) vira a opção no formato oficial. */
  function addNumber(index: number, kind: "length" | "quantity" | "number") {
    const raw = drafts[index];
    if (kind === "quantity") {
      const units = quantityFrom(raw);
      if (units === null) return setDraftError(index, "Digite um número inteiro de 1 a 9999.");
      return void addOption(index, quantityOption(units));
    }
    if (kind === "number") {
      const size = Number(raw);
      if (!Number.isInteger(size) || size < 1 || size > 99) return setDraftError(index, "Digite uma numeração de 1 a 99.");
      return void addOption(index, String(size));
    }
    const cm = measureFrom(raw);
    if (cm === null) return setDraftError(index, "Digite um comprimento em cm (ex.: 45 ou 45,5).");
    addOption(index, lengthOption(cm));
  }

  function addMeasure(index: number) {
    const width = measureFrom(measures[index].width);
    const height = measureFrom(measures[index].height);
    if (width === null || height === null) return setDraftError(index, "Digite a largura e a altura em cm (ex.: 30 e 40).");
    if (addOption(index, measureOption(width, height)))
      setMeasures((current) => current.map((item, position) => (position === index ? { width: "", height: "" } : item)));
  }

  /** Troca o tipo: mantém só as opções que valem para o novo tipo. */
  function chooseType(index: number, type: VariationType) {
    const group = value.groups[index];
    const options = group.options
      .map((option) => checkOption(type, option))
      .flatMap((result) => (result.ok ? [result.value] : []))
      .filter((option, position, list) => list.findIndex((item) => item.toLowerCase() === option.toLowerCase()) === position);
    setDraftError(index, "");
    setDrafts((current) => current.map((draft, position) => (position === index ? "" : draft)));
    setGroup(index, { name: type, options });
  }

  function removeOption(index: number, option: string) {
    const group = value.groups[index];
    const images = { ...value.images };
    if (index === 0) delete images[option.toLowerCase()];
    onChange({ ...value, images, groups: value.groups.map((current, position) =>
      position === index ? { ...group, options: group.options.filter((item) => item !== option) } : current) });
  }

  function renameOption(index: number, option: string, raw: string) {
    const group = value.groups[index];
    const checked = checkOption(cleanText(group.name), raw);
    const next = checked.ok ? checked.value : "";
    if (!next || next === option) return;
    if (next.length > VARIATION_OPTION_MAX || group.options.some((item) => item !== option && item.toLowerCase() === next.toLowerCase())) return;
    // Leva preço/estoque/foto para o novo nome.
    const values: Record<string, VariantValues> = {};
    const other = value.groups[index === 0 ? 1 : 0]?.options ?? [];
    for (const [key, entry] of Object.entries(value.values)) values[key] = entry;
    const pairs = twoLevels ? other : [null];
    for (const partner of pairs) {
      const oldKey = index === 0 ? variantKey(option, partner) : variantKey(partner ?? "", option);
      const newKey = index === 0 ? variantKey(next, partner) : variantKey(partner ?? "", next);
      if (value.values[oldKey]) values[newKey] = value.values[oldKey];
    }
    const images = { ...value.images };
    if (index === 0 && images[option.toLowerCase()]) {
      images[next.toLowerCase()] = images[option.toLowerCase()];
      delete images[option.toLowerCase()];
    }
    onChange({ ...value, values, images, groups: value.groups.map((current, position) =>
      position === index ? { ...group, options: group.options.map((item) => (item === option ? next : item)) } : current) });
  }

  function onDraftKey(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const type = cleanText(value.groups[index]?.name);
      const kind = isVariationType(type) ? TYPE_KIND[type] : "free";
      if (kind === "length" || kind === "quantity") addNumber(index, kind);
      else if (kind === "size") addNumber(index, "number");
      else addOption(index);
    }
  }

  function setRow(key: string, patch: Partial<VariantValues>) {
    const current = value.values[key] ?? { price: "", stock: "0" };
    update({ values: { ...value.values, [key]: { ...current, ...patch } } });
  }

  function applyToAll() {
    if (!bulk.price && !bulk.stock) return;
    const values = { ...value.values };
    for (const row of rows) {
      values[row.key] = {
        price: bulk.price !== "" ? bulk.price : row.price,
        stock: bulk.stock !== "" ? bulk.stock : row.stock,
      };
    }
    update({ values });
    setBulk({ price: "", stock: "" });
  }

  if (!value.enabled) {
    return (
      <section className="catalog-variations is-off" aria-labelledby={`${id}-titulo`}>
        <div className="catalog-variations-intro">
          <Layers size={18} />
          <span>
            <strong id={`${id}-titulo`}>Variações</strong>
            <small>A peça vem em cores, tamanhos ou modelos diferentes? Cadastre tudo nesta mesma peça, com preço e estoque de cada opção.</small>
          </span>
        </div>
        <button type="button" className="catalog-variations-enable" onClick={enable} disabled={disabled}>
          <Plus size={16} /> Habilitar variações
        </button>
      </section>
    );
  }

  return (
    <section className="catalog-variations" aria-labelledby={`${id}-titulo`}>
      <div className="catalog-variations-intro">
        <Layers size={18} />
        <span>
          <strong id={`${id}-titulo`}>Variações</strong>
          <small>Escolha o tipo (ex.: Cor) e cadastre as opções. O preço e o estoque de cada uma ficam na lista abaixo.</small>
        </span>
        <button type="button" className="catalog-variations-remove" onClick={disable} disabled={disabled}>
          <Trash2 size={14} /> Remover variações
        </button>
      </div>

      {value.groups.map((group, index) => {
        const type = cleanText(group.name);
        const known = isVariationType(type) ? type : null;
        const kind = known ? TYPE_KIND[known] : null;
        const usedNames = value.groups.filter((_, position) => position !== index).map((item) => cleanText(item.name));
        const has = (option: string) => group.options.some((item) => item.toLowerCase() === option.toLowerCase());
        const full = group.options.length >= MAX_OPTIONS_PER_GROUP;
        return (
          <div className="catalog-variation-group" key={index}>
            <div className="catalog-variation-group-head">
              <span className="catalog-variation-step">Variação {index + 1}</span>
              {index === 1 && (
                <button type="button" className="catalog-variation-icon" disabled={disabled}
                  onClick={() => update({ groups: value.groups.slice(0, 1) })} aria-label="Remover a variação 2" title="Remover a variação 2">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="catalog-variation-name">
              <span id={`${id}-tipo-${index}`}>Tipo da variação</span>
              <div className="catalog-chip-row" role="radiogroup" aria-labelledby={`${id}-tipo-${index}`}>
                {VARIATION_TYPES.filter((item) => !usedNames.includes(item)).map((item) => (
                  <button type="button" key={item} role="radio" className={type === item ? "is-selected" : undefined}
                    aria-checked={type === item} disabled={disabled} onClick={() => chooseType(index, item)}>
                    {item}
                  </button>
                ))}
              </div>
              {type && !known && (
                <p className="catalog-variation-error" role="alert">
                  O tipo “{type}” não é mais aceito. Escolha um tipo da lista; as opções que servirem para ele são mantidas.
                </p>
              )}
            </div>

            {known && (
              <div className="catalog-variation-options">
                <span className="catalog-variation-label">
                  Opções{group.options.length ? ` (${group.options.length}/${MAX_OPTIONS_PER_GROUP})` : ""}
                </span>
                <small className="catalog-variation-hint">{TYPE_HINT[known]}</small>

                {kind === "color" && (
                  <div className="catalog-color-picker">
                    <label>
                      <input type="color" value={picked[index]?.hex ?? "#b26b4f"} disabled={disabled || full}
                        aria-label="Escolher a cor no seletor"
                        onChange={(event) => pickColor(index, event.target.value)} />
                      <span>Escolher a cor no seletor</span>
                    </label>
                    <small aria-live="polite">
                      {picked[index]
                        ? <>Cor escolhida associada a <strong>{picked[index]!.name}</strong>{has(picked[index]!.name) ? " (marcada abaixo)" : ""}.</>
                        : "Escolha uma cor e o sistema associa ao nome mais parecido da paleta."}
                    </small>
                  </div>
                )}
                {kind === "color" && (
                  <div className="catalog-swatches" role="group" aria-label="Paleta de cores">
                    {COLORS.map((color) => (
                      <button type="button" key={color.name} aria-pressed={has(color.name)} disabled={disabled || (full && !has(color.name))}
                        className={has(color.name) ? "is-selected" : undefined} onClick={() => toggleOption(index, color.name)}>
                        <i style={{ background: color.hex }} aria-hidden="true" /> {color.name}
                      </button>
                    ))}
                  </div>
                )}
                {(kind === "material" || kind === "size") && (
                  <div className="catalog-chip-row" role="group" aria-label={kind === "material" ? "Materiais" : "Tamanhos"}>
                    {(kind === "material" ? MATERIALS : SIZE_LETTERS).map((option) => (
                      <button type="button" key={option} aria-pressed={has(option)} disabled={disabled || (full && !has(option))}
                        className={has(option) ? "is-selected" : undefined} onClick={() => toggleOption(index, option)}>
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {group.options.length > 0 && kind !== "color" && kind !== "material" && (
                  <ul className="catalog-option-chips">
                    {group.options.map((option) => {
                      const valid = checkOption(known, option).ok;
                      return (
                        <li key={option} className={valid ? undefined : "is-invalid"} title={valid ? undefined : "Opção fora da regra: remova e escolha de novo"}>
                          {kind === "free" ? (
                            <input aria-label={`Opção ${option}`} defaultValue={option} maxLength={FREE_TEXT_MAX} disabled={disabled}
                              size={Math.max(4, option.length)}
                              onBlur={(event) => { renameOption(index, option, event.target.value); event.target.value = cleanText(event.target.value) || option; }}
                              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
                          ) : <span>{option}</span>}
                          <button type="button" onClick={() => removeOption(index, option)} disabled={disabled}
                            aria-label={`Remover a opção ${option}`} title="Remover opção"><X size={12} /></button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(kind === "color" || kind === "material") && group.options.some((option) => !checkOption(known, option).ok) && (
                  <ul className="catalog-option-chips">
                    {group.options.filter((option) => !checkOption(known, option).ok).map((option) => (
                      <li key={option} className="is-invalid" title="Opção fora da lista: remova">
                        <span>{option}</span>
                        <button type="button" onClick={() => removeOption(index, option)} disabled={disabled}
                          aria-label={`Remover a opção ${option}`}><X size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}

                {kind === "size" && (
                  <div className="catalog-option-add is-measure">
                    <input type="text" inputMode="decimal" placeholder="Largura" value={measures[index].width} disabled={disabled || full}
                      aria-label="Largura em cm"
                      onChange={(event) => { const width = event.target.value; setMeasures((current) => current.map((item, position) => (position === index ? { ...item, width } : item))); setDraftError(index, ""); }} />
                    <span aria-hidden="true">×</span>
                    <input type="text" inputMode="decimal" placeholder="Altura" value={measures[index].height} disabled={disabled || full}
                      aria-label="Altura em cm"
                      onChange={(event) => { const height = event.target.value; setMeasures((current) => current.map((item, position) => (position === index ? { ...item, height } : item))); setDraftError(index, ""); }}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addMeasure(index); } }} />
                    <span>cm</span>
                    <button type="button" onClick={() => addMeasure(index)} disabled={disabled || full}><Plus size={14} /> Medida</button>
                  </div>
                )}
                {(kind === "size" || kind === "length" || kind === "quantity" || kind === "free") && (
                  <div className="catalog-option-add">
                    <input value={drafts[index]} disabled={disabled || full}
                      type="text"
                      inputMode={kind === "free" ? "text" : kind === "length" ? "decimal" : "numeric"}
                      maxLength={kind === "free" ? FREE_TEXT_MAX : 7}
                      aria-label={kind === "size" ? "Numeração" : `Nova opção de ${known}`}
                      aria-invalid={draftErrors[index] ? true : undefined}
                      placeholder={kind === "size" ? "Numeração (ex.: 38)" : kind === "length" ? "Comprimento em cm (ex.: 45)"
                        : kind === "quantity" ? "Unidades (ex.: 4)" : `Ex.: ${known === "Aroma" ? "Lavanda" : known === "Estampa" ? "Floral" : "Clássico"}`}
                      onChange={(event) => {
                        const next = kind === "free" ? event.target.value : event.target.value.replace(kind === "length" ? /[^\d,.]/g : /\D/g, "");
                        setDrafts((current) => current.map((draft, position) => (position === index ? next : draft)));
                        if (draftErrors[index]) setDraftError(index, "");
                      }}
                      onKeyDown={(event) => onDraftKey(index, event)} />
                    {kind === "length" && <span>cm</span>}
                    {kind === "quantity" && <span>unidades</span>}
                    <button type="button" disabled={disabled || full}
                      onClick={() => (kind === "free" ? addOption(index) : addNumber(index, kind === "size" ? "number" : kind))}>
                      <Plus size={14} /> {kind === "size" ? "Numeração" : "Adicionar"}
                    </button>
                  </div>
                )}
                {draftErrors[index] && <small className="catalog-variation-error" role="alert">{draftErrors[index]}</small>}
              </div>
            )}

            {index === 0 && group.options.length > 0 && photos.length > 0 && (
              <div className="catalog-option-photos">
                <span className="catalog-variation-label">Foto de cada opção <em>(opcional)</em></span>
                <ul>
                  {group.options.map((option) => {
                    const chosen = value.images[option.toLowerCase()] ?? "";
                    return (
                      <li key={option}>
                        <span>{option}</span>
                        <div role="radiogroup" aria-label={`Foto da opção ${option}`}>
                          <button type="button" role="radio" aria-checked={!chosen} className={!chosen ? "is-selected" : undefined}
                            disabled={disabled} onClick={() => { const images = { ...value.images }; delete images[option.toLowerCase()]; update({ images }); }}>
                            Capa
                          </button>
                          {photos.map((photo, photoIndex) => (
                            <button type="button" role="radio" key={photo.id} aria-checked={chosen === photo.id}
                              className={chosen === photo.id ? "is-selected" : undefined} disabled={disabled}
                              aria-label={`Foto ${photoIndex + 1}`} title={`Foto ${photoIndex + 1}`}
                              onClick={() => update({ images: { ...value.images, [option.toLowerCase()]: photo.id } })}>
                              <img src={photoSrc(photo)} alt="" />
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      {value.groups.length < MAX_VARIATION_GROUPS && (
        <button type="button" className="catalog-variation-add-group" disabled={disabled}
          onClick={() => update({ groups: [...value.groups, { name: "", options: [] }] })}>
          <Plus size={15} /> Adicionar variação 2 <small>(ex.: Cor + Tamanho)</small>
        </button>
      )}

      {rows.length > 0 && (
        <div className="catalog-variant-list">
          <div className="catalog-variant-list-head">
            <span className="catalog-variation-label">Lista de variações</span>
            <small>
              {rows.length} {rows.length === 1 ? "combinação" : "combinações"}
              {totals.minPrice > 0 && ` · ${totals.minPrice === totals.maxPrice ? money.format(totals.minPrice) : `de ${money.format(totals.minPrice)} a ${money.format(totals.maxPrice)}`}`}
              {` · ${totals.totalStock} em estoque`}
            </small>
          </div>
          {rows.length > MAX_VARIANTS && (
            <p className="catalog-variation-error" role="alert">Use no máximo {MAX_VARIANTS} combinações. Remova algumas opções.</p>
          )}
          <div className="catalog-variant-bulk" role="group" aria-label="Aplicar preço e estoque a todas as combinações">
            <span className="catalog-money-field">
              <b>R$</b>
              <input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="Preço" value={bulk.price} disabled={disabled}
                aria-label="Preço para todas" onChange={(event) => setBulk((current) => ({ ...current, price: event.target.value }))} />
            </span>
            <input type="number" inputMode="numeric" min="0" step="1" placeholder="Estoque" value={bulk.stock} disabled={disabled}
              aria-label="Estoque para todas" onChange={(event) => setBulk((current) => ({ ...current, stock: event.target.value }))} />
            <button type="button" onClick={applyToAll} disabled={disabled || (!bulk.price && !bulk.stock)}>Aplicar a todos</button>
          </div>
          <div className="catalog-variant-table-wrap">
            <table className="catalog-variant-table">
              <thead>
                <tr>
                  <th scope="col">{cleanText(value.groups[0]?.name) || "Variação 1"}</th>
                  {twoLevels && <th scope="col">{cleanText(value.groups[1]?.name) || "Variação 2"}</th>}
                  <th scope="col"><span className="is-required">*</span> Preço</th>
                  <th scope="col"><span className="is-required">*</span> Estoque</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => {
                  const firstOfGroup = !twoLevels || rowIndex === 0 || rows[rowIndex - 1].option1 !== row.option1;
                  const span = twoLevels ? rows.filter((item) => item.option1 === row.option1).length : 1;
                  const photoId = value.images[row.option1.toLowerCase()];
                  const photo = photos.find((item) => item.id === photoId);
                  const label = [row.option1, row.option2].filter(Boolean).join(" / ");
                  return (
                    <tr key={row.key}>
                      {firstOfGroup && (
                        <th scope="rowgroup" rowSpan={span} className="catalog-variant-option">
                          {photo && <img src={photoSrc(photo)} alt="" />}
                          <span>{row.option1}</span>
                        </th>
                      )}
                      {twoLevels && <td className="catalog-variant-option2">{row.option2}</td>}
                      <td>
                        <span className="catalog-money-field">
                          <b>R$</b>
                          <input type="number" inputMode="decimal" min="0.01" max="99999999.99" step="0.01" placeholder="0,00"
                            value={row.price} disabled={disabled} aria-label={`Preço de ${label}`}
                            onChange={(event) => setRow(row.key, { price: event.target.value })} />
                        </span>
                      </td>
                      <td>
                        <input type="number" inputMode="numeric" min="0" max="999999" step="1"
                          value={row.stock} disabled={disabled} aria-label={`Estoque de ${label}`}
                          onChange={(event) => setRow(row.key, { stock: event.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <small className="catalog-variant-note">
            Na vitrine aparece o menor preço (“a partir de”). Opção com estoque 0 vira sob encomenda — ou esgotada, se a loja não aceitar encomendas.
          </small>
        </div>
      )}
    </section>
  );
}
