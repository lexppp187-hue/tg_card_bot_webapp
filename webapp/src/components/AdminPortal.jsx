import React, { useState, useEffect } from "react";

export default function AdminPortal() {
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [inputToken, setInputToken] = useState("");
  const [cards, setCards] = useState([]);
  const [logged, setLogged] = useState(false);

  async function enter() {
    // тестируем токен = пробуем загрузить карточки
    const r = await fetch("/api/admin/cards", {
      headers: { "x-admin-token": inputToken }
    });

    if (r.status === 200) {
      localStorage.setItem("adminToken", inputToken);
      setToken(inputToken);
      setLogged(true);
      load();
    } else {
      alert("Неверный админ токен");
    }
  }

  async function load() {
    const r = await fetch("/api/admin/cards", {
      headers: { "x-admin-token": token }
    });

    const j = await r.json();
    if (j.cards) setCards(j.cards);
  }

  useEffect(() => {
    if (token) {
      setLogged(true);
      load();
    }
  }, []);

  if (!logged) {
    return (
      <div>
        <h3>Admin Portal</h3>
        <input
          placeholder="Admin token"
          value={inputToken}
          onChange={(e) => setInputToken(e.target.value)}
        />
        <button onClick={enter}>Войти</button>
      </div>
    );
  }

  return (
    <div>
      <h3>Admin Portal</h3>
      <AddForm token={token} onDone={load} />

      <div className="card-grid" style={{ marginTop: 12 }}>
        {cards.map((c) => (
          <div className="card" key={c.id}>
            <img src={c.image} style={{ width: "120px" }} />
            <div><b>{c.name}</b></div>
            <div style={{ color: "#9ca3af" }}>[{c.rarity}]</div>
            <div style={{ marginTop: 8 }}>coins/hr: {c.coins_per_hour}</div>

            <button
              onClick={async () => {
                await fetch("/api/admin/cards/" + c.id, {
                  method: "DELETE",
                  headers: { "x-admin-token": token }
                });
                load();
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddForm({ token, onDone }) {
  const [name, setName] = useState("");
  const [rarity, setRarity] = useState("common");
  const [image, setImage] = useState("");
  const [coins, setCoins] = useState("");

  async function add() {
    const res = await fetch("/api/admin/cards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token
      },
      body: JSON.stringify({
        name,
        description: "",
        rarity,
        image,
        coins_per_hour: Number(coins)
      })
    });

    const j = await res.json();
    if (j.card) {
      onDone();
    } else {
      alert(JSON.stringify(j));
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />

      <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
        <option>common</option>
        <option>rare</option>
        <option>epic</option>
        <option>legendary</option>
      </select>

      <input placeholder="Image URL" value={image} onChange={(e) => setImage(e.target.value)} />

      <input
        placeholder="coins/hr"
        type="number"
        value={coins}
        onChange={(e) => setCoins(e.target.value)}
      />

      <button onClick={add}>Add</button>
    </div>
  );
}
