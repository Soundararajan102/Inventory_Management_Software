# Inventory Management & POS System

A native desktop Point of Sale (POS) and Inventory Management software built for performance, completely offline capabilities, and a sleek user interface. 

## 🏗️ Tech Stack
*   **Frontend Core:** React 19 + Vite
*   **Desktop Engine:** Tauri V2 (Rust backend)
*   **Routing:** React Router v7 (`react-router-dom`)
*   **Styling:** Tailwind CSS v4 (Custom UI, no external UI libraries)
*   **Icons:** Lucide React (`lucide-react`)
*   **Database:** Local SQLite via `@tauri-apps/plugin-sql`

---

## 🚀 How to Run the App for Development (CRITICAL)

**⚠️ DO NOT use a standard web browser (like Chrome/Edge).**
Because this is a native desktop application, the React frontend relies heavily on Tauri's native plugins (specifically the SQLite plugin) to read and write data to the local `.db` file. If you run the frontend and open it in a web browser, the app will crash at the login screen because browsers cannot access the local database file.

To develop the UI, you **must** run the app through the Tauri Desktop window. It has Hot-Module Replacement (HMR) built-in, so the desktop window refreshes instantly when you save your React files.

### Step-by-Step Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Soundararajan102/Inventory_Management_Software.git
   cd Inventory_Management_Software
   ```

2. **Terminal 1: Start the React Server**
   Open your first terminal and run:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Terminal 2: Launch the Native Desktop App**
   Open a second terminal and run:
   ```bash
   cd backend
   npm install
   npx @tauri-apps/cli dev
   ```

A native desktop window will pop up. **Use this window to view and interact with your frontend changes.** 

> 🔐 **Default Login:**
> User: `Admin`
> PIN: `1234`

---

## 📂 Project Structure

*   **`frontend/src/App.tsx`**: The core layout wrapper. Contains the main `Sidebar`, the `AuthContext` provider (which handles login state), and all `react-router` definitions. 
*   **`frontend/src/pages/`**: Contains the individual UI screens (e.g., `POS.tsx`, `Inventory.tsx`, `Dashboard.tsx`). You will do 99% of your UI work in this folder.
*   **`frontend/src/lib/db.ts`**: **The Database Layer.** All database queries are strictly centralized here. Do not write raw SQL queries directly inside the React components. If your UI needs new data, look for an existing helper function here first, or add a new one.
*   **`backend/src/lib.rs`**: The Rust backend file where the SQLite database migrations are defined.

---

## 🎨 Styling Guidelines

We want to maintain a premium, clean aesthetic. Please adhere to these patterns:

*   **Page Layouts:** All main screens should be wrapped in this container to maintain the consistent off-white background and padding:
    ```tsx
    <div className="p-8 h-full flex flex-col relative bg-slate-50 overflow-hidden">
    ```
*   **Cards & Panels:** Use `bg-white border border-slate-200 shadow-sm rounded-xl`.
*   **Primary Action Buttons:** Use `bg-blue-600 hover:bg-blue-700 text-white rounded-xl`.
*   **Typography:** We lean heavily on Tailwind's `slate` palette. Use `text-slate-800` for primary text/headings, and `text-slate-500` for secondary text/subtitles.
*   **Icons:** Use the `lucide-react` library for all icons to maintain a uniform line-art style.

---

## 🎯 Contributing Goals
*   Improve spacing, responsive design, and micro-animations.
*   Break down massive page files (like `POS.tsx` or `Purchases.tsx`) into smaller, modular sub-components (e.g., `CartPanel.tsx`, `ProductGrid.tsx`, `CheckoutModal.tsx`) to keep the codebase clean.
*   **Do not** modify the underlying database logic in `db.ts` or `lib.rs` without coordinating, as they are tightly bound to the application's core functionality.
