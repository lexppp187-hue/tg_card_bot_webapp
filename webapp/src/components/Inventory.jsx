import React, { useEffect, useState } from "react";

export default function Inventory() {
  const [inv, setInv] = useState(null);
  const [error, setError] = useState("");

  // ---- FIX: правильная отправка Telegram initData ----
  const initData = window.Telegram?.WebApp?.initData || "";

  async function loadInventory() {
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-init-data": initData       // <-- ВСЁ ЧТО НУЖНО
        },
        body: JSON.stringify({})
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setInv(data);
    } catch (e) {
      setError("Failed to load inventory");
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  // LOADING SCREEN
  if (!inv && !error) {
    return <div style={{ textAlign: "center", padding: 20 }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ color: "red", padding: 20 }}>{error}</div>;
  }

  return (
    <div>
      <h3 style={{ color: "#fff", marginBottom: 12 }}>
        Inventory — coins: {inv.coins}
      </h3>

      <div
        className="card-grid"
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        }}
      >
        {inv.cards.map((c) => (
          <div
            className="card"
            key={c.id}
            style={{
              background: "#1c1f2e",
              borderRadius: 12,
              padding: 10,
              boxShadow: "0 0 12px rgba(0,0,0,0.4)",
              textAlign: "center",
              color: "white"
            }}
          >
            <img
              src={
                c.image ||
                "https://via.placeholder.com/200x200?text=Card"
              }
              alt={c.name}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                borderRadius: 8
              }}
            />
            <div
              style={{
                fontWeight: "bold",
                marginTop: 6,
                fontSize: 14
              }}
            >
              {c.name}
            </div>

            <div style={{ color: "#9ca3af", fontSize: 12 }}>
              [{c.rarity}] ×{c.qty}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
