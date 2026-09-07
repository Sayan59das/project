import axios from 'axios';

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:4000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// The dedicated REST routes (/products, /masters/*, ...) wrap every response
// as { success, data } (see backend/src/controllers/http.ts sendData) —
// unwrap it here once so every caller can keep destructuring `{ data }`
// straight off the axios response, same as before that envelope existed.
apiClient.interceptors.response.use((response) => {
  if (response.data && typeof response.data === 'object' && 'data' in response.data) {
    response.data = response.data.data;
  }
  return response;
});

// Every write is recorded against a person (see backend/src/controllers/http.ts
// requireActor) — the caller states who they are in this header. There is no
// auth yet, so this is a claim, not a verified identity.
export function actorHeaders(actorName: string): Record<string, string> {
  return { 'X-Actor-Name': actorName };
}

// A workflow decision is recorded against a specific person, not just a name
// (see backend/src/controllers/http.ts requireWorkflowActor) — the audit
// trail needs id and role too, to join back to the user and to show who was
// authorized to act.
export function workflowActorHeaders(actor: { id: string; name: string; role: string }): Record<string, string> {
  return { 'X-Actor-Id': actor.id, 'X-Actor-Name': actor.name, 'X-Actor-Role': actor.role };
}

export default apiClient;
