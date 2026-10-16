import { useEffect, useState } from "react";

// 해시 라우터: nginx 설정 없이도 새로고침에 안전하고, 의존성이 없다.
export type Route =
  | { name: "login" }
  | { name: "home" }
  | { name: "new" }
  | { name: "review"; id: number }
  | { name: "dashboard" }
  | { name: "system" };

export function parse(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  const m = path.match(/^\/reviews\/(\d+)/);
  if (m) return { name: "review", id: Number(m[1]) };
  switch (path) {
    case "/login":
      return { name: "login" };
    case "/new":
      return { name: "new" };
    case "/dashboard":
      return { name: "dashboard" };
    case "/system":
      return { name: "system" };
    default:
      return { name: "home" };
  }
}

export function go(path: string) {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
