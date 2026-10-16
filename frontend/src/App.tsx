import { useEffect } from "react";
import { TopBar } from "./components/common";
import { session } from "./lib/api";
import { go, useRoute } from "./lib/router";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NewReview from "./pages/NewReview";
import ReviewPage from "./pages/Review";
import System from "./pages/System";

export default function App() {
  const route = useRoute();
  const authed = !!session.token();

  useEffect(() => {
    if (!authed && route.name !== "login" && route.name !== "system") go("/login");
  }, [authed, route.name]);

  if (route.name === "login") return <Login />;
  if (!authed && route.name !== "system") return null;

  return (
    <>
      <TopBar route={route} />
      {route.name === "home" && <Home />}
      {route.name === "new" && <NewReview />}
      {route.name === "review" && <ReviewPage key={route.id} id={route.id} />}
      {route.name === "dashboard" && <Dashboard />}
      {route.name === "system" && <System />}
    </>
  );
}
