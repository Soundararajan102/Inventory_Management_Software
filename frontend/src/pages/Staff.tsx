import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Key } from 'lucide-react';
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

  async function handleResetPin(id: number, username: string) {
    const newPin = prompt(`Enter new PIN for ${username}:`);
    if (!newPin) return;
    
    if (newPin.trim().length < 4) {
      alert('PIN must be at least 4 digits');
      return;
    }
    
    try {
      const db = await getDb();
      await db.execute('UPDATE users SET pin = $1 WHERE id = $2', [newPin.trim(), id]);
      alert(`PIN for ${username} updated successfully!`);
    } catch (e) {
      console.error('Failed to reset PIN', e);
      alert('Failed to reset PIN.');
    }
  }

  return (
    <div className="p-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-canvas p-6 rounded-lg border border-hairline">
            <h2 className="text-lg font-medium text-ink mb-5 flex items-center">
              <UserPlus className="w-5 h-5 mr-2 text-muted" />
              Add New User
            </h2>
            <form onSubmit={handleAddUser}>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Username *</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">PIN *</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm font-mono tracking-widest"
                    placeholder="e.g. 1234"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Role Template</label>
                  <select
                    value={newRole}
                    onChange={(e) => handleRoleChange(e.target.value as any)}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm"
                  >
                    <option value="billing">Billing Staff</option>
                    <option value="stock">Stock Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Custom Permissions</label>
                  <div className="bg-surface-soft border border-hairline rounded-sm p-4 space-y-3 max-h-60 overflow-y-auto">
                    {AVAILABLE_PERMISSIONS.map(perm => (
                      <label key={perm.path} className="flex items-center space-x-3 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={newPermissions.includes(perm.path)}
                          onChange={() => togglePermission(perm.path)}
                          disabled={newRole === 'admin'} // Admin always has all
                          className="w-4 h-4 text-ink border-hairline rounded-sm focus:ring-ink"
                        />
                        <span className="text-sm text-ink font-medium">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                  {newRole === 'admin' && <p className="text-xs text-muted mt-2">Admin users automatically have all permissions.</p>}
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary text-on-primary font-medium py-3 rounded-lg hover:bg-primary-active transition-colors text-sm"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-canvas rounded-lg border border-hairline overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider">
                  <th className="px-6 py-4">Username</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Access Count</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                    <td className="px-6 py-4 font-medium text-ink">{u.username}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-sm uppercase border border-hairline text-ink bg-canvas`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-muted">
                      {u.role === 'admin' ? 'All Access' : `${u.permissions?.length || 0} Modules`}
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button
                        onClick={() => handleResetPin(u.id, u.username)}
                        className="p-1 text-muted hover:text-ink hover:bg-surface-soft rounded-sm transition-colors"
                        title="Reset PIN"
                      >
                        <Key className="w-5 h-5" />
                      </button>
                      {u.username !== 'Admin' && (
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-1 text-muted hover:text-signature-coral hover:bg-surface-soft rounded-sm transition-colors"
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
