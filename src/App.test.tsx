import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("Sonora", () => {
  beforeEach(() => localStorage.clear());

  it("mostra a biblioteca vazia e a acao de importacao", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Meus sons" })).toBeInTheDocument();
    expect(screen.getByText("Sua biblioteca está vazia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Importar áudios/i })).toBeInTheDocument();
  });

  it("oferece controles essenciais do mixer", () => {
    render(<App />);
    expect(screen.getByLabelText("Volume geral")).toHaveValue("85");
    expect(screen.getByRole("button", { name: /Parar tudo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Modo exclusivo/i })).toBeInTheDocument();
  });
});
