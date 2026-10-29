import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

// Official Bootstrap Icons, served locally. Aliases preserve existing callers.
function icon(name: string) {
  return function BootstrapIcon({ size = 24, className = "", fill, ...props }: IconProps) {
    const symbol = name === "heart" && fill === "currentColor" ? "heart-fill" : name;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        className={`bi bi-${symbol} ${className}`.trim()}
        {...props}
      >
        <use href={`/icons/bootstrap-icons.svg#${symbol}`} />
      </svg>
    );
  };
}

export const AlertTriangle = icon("exclamation-triangle");
export const Archive = icon("archive");
export const ArrowLeft = icon("arrow-left");
export const ArrowRight = icon("arrow-right");
export const BadgePercent = icon("patch-check");
export const Bell = icon("bell");
export const Box = icon("box");
export const Boxes = icon("boxes");
export const Calculator = icon("calculator");
export const Camera = icon("camera");
export const CheckCircle2 = icon("check-circle");
export const Check = icon("check2");
export const ChevronDown = icon("chevron-down");
export const ChevronLeft = icon("chevron-left");
export const ChevronRight = icon("chevron-right");
export const CircleDollarSign = icon("currency-dollar");
export const CircleSlash2 = icon("slash-circle");
export const ClipboardList = icon("clipboard-check");
export const Clock3 = icon("clock");
export const CreditCard = icon("credit-card");
export const Download = icon("download");
export const Edit3 = icon("pencil-square");
export const ExternalLink = icon("box-arrow-up-right");
export const Eye = icon("eye");
export const EyeOff = icon("eye-slash");
export const FileCheck2 = icon("file-earmark-check");
export const FileSearch = icon("file-earmark-text");
export const FileText = icon("file-text");
export const Flag = icon("flag");
export const HandCoins = icon("cash-coin");
export const HandHeart = icon("suit-heart");
export const Heart = icon("heart");
export const KeyRound = icon("key");
export const History = icon("clock-history");
export const ImagePlus = icon("image");
export const LifeBuoy = icon("life-preserver");
export const LayoutDashboard = icon("grid");
export const Loader2 = icon("arrow-repeat");
export const LoaderCircle = icon("arrow-repeat");
export const LockKeyhole = icon("lock");
export const LogOut = icon("box-arrow-right");
export const Mail = icon("envelope");
export const MapPin = icon("geo-alt");
export const Menu = icon("list");
export const MessageCircle = icon("chat");
export const MessageSquare = icon("chat-left-text");
export const MessageSquareWarning = icon("chat-left-text");
export const Minus = icon("dash");
export const Package = icon("box-seam");
export const PackageCheck = icon("box-seam");
export const PackageOpen = icon("box2");
export const Palette = icon("palette");
export const PauseCircle = icon("pause-circle");
export const Pencil = icon("pencil");
export const Percent = icon("percent");
export const Plus = icon("plus");
export const RefreshCw = icon("arrow-clockwise");
export const Ruler = icon("rulers");
export const Save = icon("floppy");
export const Scale = icon("speedometer2");
export const Reply = icon("reply");
export const Search = icon("search");
export const Send = icon("send");
export const Settings = icon("gear");
export const ShieldCheck = icon("shield-check");
export const ShoppingBag = icon("bag");
export const SlidersHorizontal = icon("sliders");
export const Sparkles = icon("stars");
export const Star = icon("star-fill");
export const StarHalf = icon("star-half");
export const StarEmpty = icon("star");
export const Store = icon("shop");
export const Tags = icon("tags");
export const Trash2 = icon("trash");
export const Truck = icon("truck");
export const Upload = icon("upload");
export const UserRound = icon("person");
export const UserRoundCheck = icon("person-check");
export const X = icon("x-lg");
export const XCircle = icon("x-circle");
