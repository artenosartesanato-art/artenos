"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Layers, Plus, Trash2, X } from "@/components/icons";
import { photoSrc, type PhotoSlot } from "@/components/product-photos-field";
import {
  MAX_OPTIONS_PER_GROUP, MAX_VARIANTS, MAX_VARIATION_GROUPS, OPTION_SUGGESTIONS, VARIATION_NAME_MAX,
  VARIATION_OPTION_MAX, VARIATION_PRESETS, buildRows, cleanText, optionError, variantKey, variationTotals,
  type VariantValues, type VariationGroup,
} from "@/lib/product-variations";

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

  function addOption(index: number, raw = drafts[index]) {
    const group = value.groups[index];
    if (!group) return;
    const problem = optionError(group, raw);
    setDraftErrors((current) => current.map((message, position) => (position === index ? problem ?? "" : message)));
    if (problem) return;
    setGroup(index, { ...group, options: [...group.options, cleanText(raw)] });
    setDrafts((current) => current.map((draft, position) => (position === index ? "" : draft)));
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
    const next = cleanText(raw);
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
      addOption(index);
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
        const suggestions = (OPTION_SUGGESTIONS[cleanText(group.name)] ?? [])
          .filter((option) => !group.options.some((item) => item.toLowerCase() === option.toLowerCase()));
        const usedNames = value.groups.filter((_, position) => position !== index).map((item) => cleanText(item.name).toLowerCase());
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
            <label className="catalog-variation-name">
              <span>Tipo da variação</span>
              <input value={group.name} maxLength={VARIATION_NAME_MAX} disabled={disabled} list={`${id}-tipos`}
                placeholder="Ex.: Cor, Tamanho, Estampa" onChange={(event) => setGroup(index, { ...group, name: event.target.value })} />
            </label>
            <div className="catalog-chip-row" role="group" aria-label="Tipos sugeridos">
              {VARIATION_PRESETS.filter((preset) => !usedNames.includes(preset.toLowerCase())).map((preset) => (
                <button type="button" key={preset} className={cleanText(group.name) === preset ? "is-selected" : undefined}
                  aria-pressed={cleanText(group.name) === preset} disabled={disabled}
                  onClick={() => setGroup(index, { ...group, name: preset })}>
                  {preset}
                </button>
              ))}
            </div>

            <div className="catalog-variation-options">
              <span className="catalog-variation-label">Opções{group.options.length ? ` (${group.options.length}/${MAX_OPTIONS_PER_GROUP})` : ""}</span>
              {group.options.length > 0 && (
                <ul className="catalog-option-chips">
                  {group.options.map((option) => (
                    <li key={option}>
                      <input aria-label={`Opção ${option}`} defaultValue={option} maxLength={VARIATION_OPTION_MAX} disabled={disabled}
                        size={Math.max(4, option.length)}
                        onBlur={(event) => { renameOption(index, option, event.target.value); event.target.value = cleanText(event.target.value) || option; }}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
                      <button type="button" onClick={() => removeOption(index, option)} disabled={disabled}
                        aria-label={`Remover a opção ${option}`} title="Remover opção"><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="catalog-option-add">
                <input value={drafts[index]} maxLength={VARIATION_OPTION_MAX} disabled={disabled}
                  aria-label={`Nova opção de ${cleanText(group.name) || `variação ${index + 1}`}`}
                  aria-invalid={draftErrors[index] ? true : undefined}
                  placeholder={cleanText(group.name) === "Tamanho" ? "Ex.: 40×50 cm" : cleanText(group.name) === "Cor" ? "Ex.: Azul" : "Digite uma opção"}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDrafts((current) => current.map((draft, position) => (position === index ? next : draft)));
                    if (draftErrors[index]) setDraftErrors((current) => current.map((message, position) => (position === index ? "" : message)));
                  }}
                  onKeyDown={(event) => onDraftKey(index, event)} />
                <button type="button" onClick={() => addOption(index)} disabled={disabled}>
                  <Plus size={14} /> Adicionar
                </button>
              </div>
              {draftErrors[index] && <small className="catalog-variation-error" role="alert">{draftErrors[index]}</small>}
              {suggestions.length > 0 && (
                <div className="catalog-chip-row is-suggestions" role="group" aria-label="Sugestões de opções">
                  {suggestions.slice(0, 8).map((option) => (
                    <button type="button" key={option} disabled={disabled} onClick={() => addOption(index, option)}>
                      <Plus size={11} /> {option}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
      <datalist id={`${id}-tipos`}>{VARIATION_PRESETS.map((preset) => <option key={preset} value={preset} />)}</datalist>

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
