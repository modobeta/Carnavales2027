import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TroupeLogo } from "../components/TroupeLogo.jsx";

describe("TroupeLogo", () => {
  afterEach(cleanup);

  it("no renderiza nada cuando la comparsa no tiene logo", () => {
    const { container } = render(<TroupeLogo troupeId="troupe-1" hasLogo={false} alt="Logo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("carga el logo con URL versionada por hash para invalidar caché", () => {
    render(<TroupeLogo troupeId="troupe-1" hasLogo sha256="abc123" alt="Logo de Estrella" />);
    expect(screen.getByRole("img", { name: "Logo de Estrella" })).toHaveAttribute(
      "src",
      "/api/v1/troupes/troupe-1/logo?v=abc123",
    );
  });

  it("oculta la imagen si falla la carga", () => {
    const { container } = render(<TroupeLogo troupeId="troupe-1" hasLogo sha256="abc123" alt="Logo" />);
    fireEvent.error(screen.getByRole("img", { name: "Logo" }));
    expect(container).toBeEmptyDOMElement();
  });
});
