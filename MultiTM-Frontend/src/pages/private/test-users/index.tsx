// src/pages/private/test-users/index.tsx
import { useEffect, useState } from "react";
import { getTestUsers, type User } from "../../../api/accounts";

export default function TestUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      try {
        setLoading(true);
        setError(null);
        const data = await getTestUsers(undefined, controller.signal);
        setUsers(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "CanceledError") {
          setError(err.message || "Failed to fetch users");
        }
      } finally {
        setLoading(false);
      }
    }

    loadUsers();

    return () => {
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          Database & API Connection Test
        </h1>

        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6 font-medium">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-200"
            >
              <h2 className="text-xl font-semibold text-blue-600">
                {user.first_name} {user.last_name}
              </h2>
              <p className="text-gray-600 font-mono text-sm">@{user.username}</p>
              <p className="text-gray-500 mt-1">Email: {user.email}</p>
              <div className="mt-3 inline-block bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                🏢 {user.tenant ? user.tenant.name : "No Tenant"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}