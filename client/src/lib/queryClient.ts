import { QueryClient, QueryFunction } from "@tanstack/react-query";
import {
  UpgradeRequiredError,
  tryHandleUpgradeRequired,
} from "./upgrade-toast";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 403) {
      const payload = await tryHandleUpgradeRequired(res);
      if (payload) {
        throw new UpgradeRequiredError(
          payload,
          `${res.status}: ${payload.error ?? "Upgrade required"}`,
        );
      }
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const json = await res.json();

    // If the response has the standard {status, data, ...} structure, extract data
    if (json && typeof json === 'object' && 'data' in json) {
      return json.data;
    }

    return json;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export { UpgradeRequiredError } from "./upgrade-toast";
