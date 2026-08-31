"use client";

import { useEffect, useState } from "react";

interface OperatorTokenFieldProps {
  className?: string;
}

export function OperatorTokenField({ className }: OperatorTokenFieldProps) {
  const [token, setToken] = useState("");

  useEffect(() => {
    setToken(window.sessionStorage.getItem("tiba_operator_token") ?? "");
  }, []);

  function saveToken(value: string) {
    setToken(value);
    window.sessionStorage.setItem("tiba_operator_token", value);
  }

  return (
    <label className={`block w-full max-w-sm text-sm font-medium ${className}`}>
      Operator token
      <input
        className="field mt-1"
        type="password"
        autoComplete="current-password"
        value={token}
        onChange={(event) => saveToken(event.target.value)}
        spellCheck={false}
      />
    </label>
  );
}