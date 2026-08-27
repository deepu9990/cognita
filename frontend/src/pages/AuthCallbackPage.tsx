import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { saveOAuthTokens } from "../services/authApi";

/** Captures the tokens Google OAuth redirects back with and stores them before entering the app. */
export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");

    if (accessToken && refreshToken) {
      saveOAuthTokens(accessToken, refreshToken);
      navigate("/", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return null;
}
