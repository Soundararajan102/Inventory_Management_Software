import { useState, useEffect } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import { getDb } from '../lib/db';
import type { User } from '../lib/AuthContext';

const AVAILABLE_PERMISSIONS = [
  { path: '/', name: 'Dashboard' },
  { path: '/pos', name: 'POS / Billing' },
  { path: '/purchases', name: 'Purchases' },
  { path: '/payments', name: 'Payments' },
  { path: '/expenses', name: 'Expenses' },
  { path: '/returns', name: 'Returns' },
  { path: '/reports', name: 'Reports' },
  { path: '/inventory', name: 'Inventory' },
  { path: '/contacts', name: 'Contacts' },
  { path: '/staff', name: 'Staff Management' },
  { path: '/settings', name: 'Settings (Backup)' },
];

const ROLE_TEMPLATES = {
  admin: AVAILABLE_PERMISSIONS.map(p => p.path),
  billing: ['/', '/pos', '/returns', '/contacts'],
  stock: ['/', '/purchases', '/returns', '/inventory']
};

export default function Staff() {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'billing' | 'stock'>('billing');
  const [newPermissions, setNewPermissions] = useState<string[]>(ROLE_TEMPLATES.billing);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const db = await getDb();
      const dbUsers = await db.select<User[]>('SELECT id, username, role, permissions FROM users');
      
      const parsedUsers = dbUsers.map(u => {
        let perms: string[] = [];
        try {
          if ((u as any).permissions) perms = JSON.parse((u as any).permissions);
        } catch(e) {}
        return { ...u, permissions: perms };
      });
      
      setUsers(parsedUsers);
    } catch (e) {
      console.error('Failed to load users', e);
    }
  }

  const handleRoleChange = (role: 'admin' | 'billing' | 'stock') => {
    setNewRole(role);
    setNewPermissions(ROLE_TEMPLATES[role]);
  };

  const togglePermission = (path: string) => {
    setNewPermissions(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername || !newPin) return;

    try {
      const db = await getDb();
      await db.execute(
        'INSERT INTO users (username, pin, role, permissions) VALUES ($1, $2, $3, $4)',
        [newUsername, newPin, newRole, JSON.stringify(newPermissions)]
      );
      setNewUsername('');
      setNewPin('');
      handleRoleChange('billing');
      loadUsers();
    } catch (e) {
      console.error('Failed to add user', e);
      alert('Failed to add user. Username might already exist.');
    }
  }

  async function handleDeleteUser(id: number) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const db = await getDb();
      await db.execute('DELETE FROM users WHERE id = $1', [id]);
      loadUsers();
    } catch (e) {
      console.error('Failed to delete user', e);
    }
  }

  return (
    <div className="p-8 h-full bg-slate-50 overflow-y-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Staff Management</h1>
        <p className="text-slate-500 mt-1">Manage user accounts and custom permissions</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <UserPlus className="w-5 h-5 mr-2 text-blue-500" />
              Add New User
            </h2>
            <form onSubmit={handleAddUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
                    placeholder="e.g. 1234"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role Template</label>
                  <select
                    value={newRole}
                    onChange={(e) => handleRoleChange(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="billing">Billing Staff</option>
                    <option value="stock">Stock Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="pt-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Custom Permissions</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                    {AVAILABLE_PERMISSIONS.map(perm => (
                      <label key={perm.path} className="flex items-center space-x-3 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={newPermissions.includes(perm.path)}
                          onChange={() => togglePermission(perm.path)}
                          disabled={newRole === 'admin'} // Admin always has all
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700 font-medium">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                  {newRole === 'admin' && <p className="text-xs text-slate-500 mt-2">Admin users automatically have all permissions.</p>}
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-bold">Username</th>
                  <th className="px-6 py-4 font-bold">Role</th>
                  <th className="px-6 py-4 font-bold">Access Count</th>
                  <th className="px-6 py-4 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">{u.username}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full uppercase
                        ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          u.role === 'billing' ? 'bg-blue-100 text-blue-700' :
                          'bg-emerald-100 text-emerald-700'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {u.role === 'admin' ? 'All Access' : `${u.permissions?.length || 0} Modules`}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {u.username !== 'Admin' && (
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
