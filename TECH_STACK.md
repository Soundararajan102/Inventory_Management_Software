# Electrical Shop Inventory System - Technology Stack

This document outlines the complete technology stack used to build this offline-first, desktop application. The system is designed to run locally on a Windows machine without requiring an active internet connection.

## 🏗 Architecture
The application is structured into two completely separate layers:
- **Backend**: A native desktop wrapper handling OS-level APIs and the local database.
- **Frontend**: A modern web interface that runs inside the desktop wrapper.

---

## ⚙️ Backend (Desktop App & Database)
**Core Technologies:**
- **Tauri**: The primary framework used to build the desktop application. It acts as the bridge between the frontend web UI and the native operating system.
- **Rust**: The programming language powering Tauri. It provides blazing-fast performance and memory safety for the backend logic.
- **SQLite**: The local, serverless database engine. All data is securely stored offline in a single `.db` file on the user's machine.
- **tauri-plugin-sql**: The official Tauri plugin used to securely execute SQL queries and run schema migrations from the frontend.

---

## 🎨 Frontend (User Interface)
**Core Technologies:**
- **React 18**: The JavaScript library used for building dynamic and interactive user interfaces.
- **Vite**: The lightning-fast build tool and development server powering the React frontend.
- **TypeScript**: Adds strong static typing to JavaScript, catching errors early and improving code quality.

**Styling & UI:**
- **Tailwind CSS (v4)**: A utility-first CSS framework used for rapid, custom styling directly within the React components.
- **Lucide React**: A beautiful and consistent open-source icon library used throughout the application.

**Routing:**
- **React Router (v6)**: Used for handling seamless, client-side navigation between different pages (Dashboard, POS, Inventory, Settings) without reloading the app.

---

## 📂 Project Structure
- `/backend`: Contains the Rust source code, `tauri.conf.json`, and handles the SQLite database initialization.
- `/frontend`: Contains the Vite + React source code, CSS files, and UI components.
