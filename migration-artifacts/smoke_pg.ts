/**
 * Staging smoke checks against DATABASE_URL (no Next server required for pg path).
 * Usage: dotenv -e .env.staging -- npx tsx migration-artifacts/smoke_pg.ts
 */
import { createClient } from "../lib/db/supabase-compat";
import { signInWithPassword } from "../lib/db/auth";
import { readObject } from "../lib/db/storage";

async function main() {
  const client = createClient();

  const products = await client
    .from("products")
    .select("id, name, slug, product_images(url)")
    .limit(2);
  if (products.error) throw new Error("products: " + products.error.message);
  console.log("products ok", products.data?.length, products.data?.[0]?.name);

  const settings = await client.from("site_settings").select("key, value").limit(5);
  if (settings.error) throw new Error("settings: " + settings.error.message);
  console.log("settings ok", settings.data?.length);

  const login = await signInWithPassword("wepedam@gmail.com", "12345678");
  if (login.error || !login.session) throw new Error("login: " + login.error);
  console.log(
    "login ok",
    login.session.user.email,
    "role=",
    login.session.user.app_metadata?.role
  );

  const imgPath = "0.6381813461617222.jpeg";
  const obj = await readObject("products", imgPath);
  console.log("storage ok", !!obj, obj?.contentType, obj?.bytes.length);

  const rpc = await client.rpc("update_customer_stats", {
    p_customer_email: "nobody@example.com",
    p_order_total: 0,
  });
  if (rpc.error) console.log("rpc warn", rpc.error.message);
  else console.log("rpc ok");

  console.log("SMOKE PASS");
}

main().catch((e) => {
  console.error("SMOKE FAIL", e);
  process.exit(1);
});
