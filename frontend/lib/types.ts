export type PublicUser = {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  role: "requester" | "approver" | "storekeeper" | "buyer" | "admin";
  cost_center: string | null;
  roleLabel: string;
};

export type Stav = "ok" | "nizka" | "nula";

export type Category = { id: number; parent_id: number | null; name: string; sort_order: number; pocet?: number };

export type Item = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category_id: number | null;
  cat_name?: string | null;
  unit: string;
  stock_qty: number;
  reorder_point: number;
  reorder_qty: number | null;
  location: string | null;
  is_esd: number;
  image_path: string | null;
  active: number;
  usage_6m?: number | null;
  ref_price?: number | null;
  ref_price_note?: string | null;
  stav?: Stav;
};

export type BundleComponent = { code: string; name: string; unit: string; stock_qty: number; qty: number };

export type Bundle = {
  id: number;
  code: string | null;
  name: string;
  description: string | null;
  category_id: number | null;
  cat_name?: string | null;
  active: number;
  komponenty: BundleComponent[];
  dostupnost: number;
};

export type Kontext = {
  user: PublicUser | null;
  verzia: string;
  flash: string | null;
  cartCount: number;
  alertCount: number;
  naSchvalenie: number;
};
