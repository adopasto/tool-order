"use server";

import { redirect } from "next/navigation";
import { apiAction } from "./api";

/**
 * Kazda mutacia na backende vracia {redirect, ok?|error?} a spoliehat sa na
 * flash spravu v session cookie (presne ako povodny Express res.redirect po
 * req.session.flash = ...). Server Action tu teda len zavola API a presmeruje
 * podla vysledku - ziadna vlastna logika naviac.
 */
async function callAndRedirect(path: string, body?: unknown): Promise<never> {
  const data = await apiAction<{ redirect: string }>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  redirect(data.redirect);
}

async function callFormAndRedirect(path: string, formData: FormData): Promise<never> {
  const data = await apiAction<{ redirect: string }>(path, { method: "POST", body: formData });
  redirect(data.redirect);
}

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function str(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// ---------------- kosik ----------------
// Pridanie do kosika ide priamo cez klientsky fetch (components/AddToCartForm.tsx),
// nie cez Server Action - pozri komentár tam.

export async function changeCartQtyAction(formData: FormData) {
  await callAndRedirect("/kosik/zmenit", {
    cartItemId: Number(formData.get("cartItemId")),
    qty: Number(formData.get("qty")),
  });
}

export async function emptyCartAction() {
  await callAndRedirect("/kosik/vyprazdnit");
}

export async function submitCartAction(formData: FormData) {
  await callAndRedirect("/kosik/odoslat", { note: str(formData.get("note")) });
}

// ---------------- ziadanky ----------------

export async function approveRequestAction(id: number) {
  await callAndRedirect(`/ziadanky/${id}/schvalit`);
}

export async function rejectRequestAction(id: number, formData: FormData) {
  await callAndRedirect(`/ziadanky/${id}/zamietnut`, { duvod: str(formData.get("duvod")) });
}

export async function cancelRequestAction(id: number) {
  await callAndRedirect(`/ziadanky/${id}/storno`);
}

export async function issueRequestAction(id: number, formData: FormData) {
  const qty: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("qty_")) {
      const lineId = key.slice(4);
      const n = Number(value);
      if (n > 0) qty[lineId] = n;
    }
  }
  await callAndRedirect(`/ziadanky/${id}/vydat`, { qty });
}

// ---------------- sklad ----------------

export async function receiveStockAction(formData: FormData) {
  await callAndRedirect("/sklad/prijem", {
    item_id: Number(formData.get("item_id")),
    qty: Number(formData.get("qty")),
    supplier_id: num(formData.get("supplier_id")),
    note: str(formData.get("note")),
  });
}

export async function correctStockAction(formData: FormData) {
  await callAndRedirect("/sklad/korekcia", {
    item_id: Number(formData.get("item_id")),
    new_qty: Number(formData.get("new_qty")),
    note: str(formData.get("note")),
    typ: String(formData.get("typ") || "INVENTURA"),
  });
}

export async function sendReorderSummaryAction() {
  await callAndRedirect("/sklad/doobjednat/suhrn");
}

// ---------------- sprava: polozky ----------------

export async function createItemAction(formData: FormData) {
  await callAndRedirect("/sprava/polozka/nova", {
    code: str(formData.get("code")),
    name: str(formData.get("name")),
    description: str(formData.get("description")),
    category_id: num(formData.get("category_id")),
    unit: str(formData.get("unit")),
    reorder_point: Number(formData.get("reorder_point") || 0),
    reorder_qty: num(formData.get("reorder_qty")),
    location: str(formData.get("location")),
    is_esd: formData.get("is_esd") === "on",
    active: formData.get("active") === "on",
    pociatocny_stav: Number(formData.get("pociatocny_stav") || 0),
  });
}

export async function updateItemAction(id: number, formData: FormData) {
  await callAndRedirect(`/sprava/polozka/${id}`, {
    code: str(formData.get("code")),
    name: str(formData.get("name")),
    description: str(formData.get("description")),
    category_id: num(formData.get("category_id")),
    unit: str(formData.get("unit")),
    reorder_point: Number(formData.get("reorder_point") || 0),
    reorder_qty: num(formData.get("reorder_qty")),
    location: str(formData.get("location")),
    is_esd: formData.get("is_esd") === "on",
    active: formData.get("active") === "on",
  });
}

export async function deleteItemAction(id: number) {
  await callAndRedirect(`/sprava/polozka/${id}/zmazat`);
}

export async function uploadPhotoAction(id: number, formData: FormData) {
  await callFormAndRedirect(`/sprava/polozka/${id}/foto`, formData);
}

export async function deletePhotoAction(id: number) {
  await callAndRedirect(`/sprava/polozka/${id}/foto/zmazat`);
}

export async function scanPhotosAction() {
  await callAndRedirect("/sprava/fotky/skenovat");
}

export async function addItemSupplierAction(id: number, formData: FormData) {
  await callAndRedirect(`/sprava/polozka/${id}/dodavatel`, {
    supplier_id: Number(formData.get("supplier_id")),
    supplier_sku: str(formData.get("supplier_sku")),
    price: num(formData.get("price")),
    min_order_qty: Number(formData.get("min_order_qty") || 1),
    is_primary: formData.get("is_primary") === "on",
  });
}

export async function removeItemSupplierAction(id: number, supplierId: number) {
  await callAndRedirect(`/sprava/polozka/${id}/dodavatel/${supplierId}/zmazat`);
}

// ---------------- sprava: kategorie ----------------

export async function createCategoryAction(formData: FormData) {
  await callAndRedirect("/sprava/kategorie", {
    name: str(formData.get("name")),
    sort_order: Number(formData.get("sort_order") || 0),
  });
}

export async function updateCategoryAction(id: number, formData: FormData) {
  await callAndRedirect(`/sprava/kategoria/${id}`, {
    name: str(formData.get("name")),
    sort_order: Number(formData.get("sort_order") || 0),
  });
}

export async function deleteCategoryAction(id: number) {
  await callAndRedirect(`/sprava/kategoria/${id}/zmazat`);
}

// ---------------- sprava: baliky ----------------

export async function createBundleAction(formData: FormData) {
  await callAndRedirect("/sprava/balik/novy", {
    code: str(formData.get("code")),
    name: str(formData.get("name")),
    description: str(formData.get("description")),
    category_id: num(formData.get("category_id")),
    active: formData.get("active") === "on",
  });
}

export async function updateBundleAction(id: number, formData: FormData) {
  await callAndRedirect(`/sprava/balik/${id}`, {
    code: str(formData.get("code")),
    name: str(formData.get("name")),
    description: str(formData.get("description")),
    category_id: num(formData.get("category_id")),
    active: formData.get("active") === "on",
  });
}

export async function addBundleComponentAction(id: number, formData: FormData) {
  await callAndRedirect(`/sprava/balik/${id}/komponent`, {
    item_id: num(formData.get("item_id")),
    qty: Number(formData.get("qty") || 1),
  });
}

export async function removeBundleComponentAction(id: number, itemId: number) {
  await callAndRedirect(`/sprava/balik/${id}/komponent/${itemId}/zmazat`);
}

export async function deleteBundleAction(id: number) {
  await callAndRedirect(`/sprava/balik/${id}/zmazat`);
}

// ---------------- sprava: dodavatelia ----------------

function supplierBody(formData: FormData) {
  return {
    name: str(formData.get("name")),
    ico: str(formData.get("ico")),
    dic: str(formData.get("dic")),
    contact_person: str(formData.get("contact_person")),
    email: str(formData.get("email")),
    phone: str(formData.get("phone")),
    web: str(formData.get("web")),
    address: str(formData.get("address")),
    lead_time_days: Number(formData.get("lead_time_days") || 7),
    note: str(formData.get("note")),
    active: formData.get("active") === "on",
  };
}

export async function createSupplierAction(formData: FormData) {
  await callAndRedirect("/sprava/dodavatel/novy", supplierBody(formData));
}

export async function updateSupplierAction(id: number, formData: FormData) {
  await callAndRedirect(`/sprava/dodavatel/${id}`, supplierBody(formData));
}

export async function deleteSupplierAction(id: number) {
  await callAndRedirect(`/sprava/dodavatel/${id}/zmazat`);
}
