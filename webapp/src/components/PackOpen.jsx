import React, { useState } from "react";

export default function PackOpen() {
  const [cards, setCards] = useState([]);
  const [opening, setOpening] = useState(false);

  const initData = window.Telegram?.WebApp?.initData || "";

  async function openPack() {
    if (opening) return;

    setOpening(true);

    const res = await fetch("/api/open_pack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-init-data": initData   // <-- FIX: правильная передача initData
      },
      body: "{}"
    });

    const j = await res.json();

    if (j.error) {
      alert(j.error);
      setOpening(false);
      return;
    }

    setCards(j.cards);

    // Закрывается через 8 секунд
    setTimeout(() => {
      setCards([]);
      setOpening(false);
    }, 8000);
  }

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ color: "#fff" }}>Open Pack</h3>

      <button
        onClick={openPack}
        style={{
          background: "linear-gradient(180deg, #6a5cff, #4633ff)",
          border: "0",
          color: "white",
          padding: "10px 20px",
          borderRadius: "10px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
          cursor: "pointer",
          fontSize: 16,
          marginTop: 8,
        }}
      >
        {opening ? "Opening..." : "Open free pack (5)"}
      </button>

      {/* PACK OPENING ZONE */}
      <div
        className="pack-area"
        style={{
          marginTop: 20,
          display: "flex",
          justifyContent: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {cards.map((c, i) => (
          <div
            key={i}
            className="pack-card"
            style={{
              width: 140,
              height: 200,
              position: "relative",
              perspective: "1000px",
              animation: "pop 0.4s ease-out forwards",
              animationDelay: i * 0.2 + "s",
            }}
          >
            <div
              className="inner"
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                transformStyle: "preserve-3d",
                transition: "transform 0.6s",
                transform: "rotateY(180deg)",
              }}
            >
              {/* BACK */}
              <div
                className="back"
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  backfaceVisibility: "hidden",
                  background:
                    "linear-gradient(180deg, #3b3bff, #2323aa 60%, #111133)",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  color: "white",
                  fontWeight: "bold",
                  transform: "rotateY(0deg)",
                }}
              >
                PACK
              </div>

              {/* FRONT */}
              <div
                className="front"
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "0 0 12px rgba(0,0,0,0.5)",
                  background: "#111",
                }}
              >
                <img
                  src={c.image}
                  alt={c.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* KEYFRAME ANIMATION */}
      <style>{`
        @keyframes pop {
          0% { transform: scale(0.2); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
