import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home page", () => {
  it("renders the main heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Next.js bootstrap is ready." })).toBeInTheDocument();
  });

  it("renders link to migration details page", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "About this migration" })).toBeInTheDocument();
  });
});
