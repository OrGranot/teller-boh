"use client";
import { useState } from "react";

interface Dept { id: string; name: string; restaurant_id: string; }

export default function DepartmentsClient({ departments: initial }: { departments: Dept[]; restaurantId: string }) {
  const [departments, setDepartments] = useState(initial);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function addDept(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError("");
    const res = await fetch("/api/departments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    if (res.ok) { setDepartments(prev => [...prev, data.department]); setNewName(""); }
    else setError(data.error || "Failed to create department");
    setAdding(false);
  }

  async function deleteDept(id: string) {
    await fetch(`/api/departments/${id}`, { method: "DELETE" });
    setDepartments(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      <h1 className="text-2xl font-bold mb-6">Departments</h1>

      <form onSubmit={addDept} className="flex gap-3 mb-6">
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="New department (e.g. Kitchen)"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-800 bg-white transition-colors" />
        <button type="submit" disabled={adding || !newName.trim()}
          className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {adding ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {departments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center"
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <p className="text-gray-400 text-sm">No departments yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          {departments.map((d, i) => (
            <div key={d.id}
              className={`flex items-center justify-between px-5 py-4 group ${i < departments.length - 1 ? "border-b border-gray-100" : ""} hover:bg-gray-50 transition-colors`}>
              <span className="font-semibold text-sm">{d.name}</span>
              <button onClick={() => deleteDept(d.id)}
                className="text-xs text-gray-400 hover:text-red-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
