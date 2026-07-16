// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import BulkImportPanel from "./BulkImportPanel";

const noop = () => {};

describe("BulkImportPanel", () => {
  const defaultProps = {
    showImport: false,
    importText: "",
    onImportTextChange: noop,
    onImport: noop,
    onCancel: noop,
  };

  it("does not render when showImport is false", () => {
    render(<BulkImportPanel {...defaultProps} />);
    expect(screen.queryByText("BULK IMPORT")).not.toBeInTheDocument();
  });

  it("renders the import panel when showImport is true", () => {
    render(<BulkImportPanel {...defaultProps} showImport={true} />);
    expect(screen.getByText("BULK IMPORT")).toBeInTheDocument();
    expect(screen.getByText("Import Cards")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows the delimiter instructions", () => {
    render(<BulkImportPanel {...defaultProps} showImport={true} />);
    expect(screen.getByText(/One card per line/)).toBeInTheDocument();
    expect(screen.getByText(";")).toBeInTheDocument();
    expect(screen.getByText("Tab")).toBeInTheDocument();
    expect(screen.getByText("|")).toBeInTheDocument();
  });

  it("renders textarea with current importText value", () => {
    render(<BulkImportPanel {...defaultProps} showImport={true} importText="hello;你好" />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("hello;你好");
  });

  it("calls onImportTextChange when textarea value changes", () => {
    const onImportTextChange = vi.fn();
    render(<BulkImportPanel {...defaultProps} showImport={true} onImportTextChange={onImportTextChange} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "new;text" } });
    expect(onImportTextChange).toHaveBeenCalledWith("new;text");
  });

  it("calls onImport when Import Cards button is clicked", () => {
    const onImport = vi.fn();
    render(<BulkImportPanel {...defaultProps} showImport={true} onImport={onImport} />);
    fireEvent.click(screen.getByText("Import Cards"));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<BulkImportPanel {...defaultProps} showImport={true} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows textarea placeholder with example format", () => {
    render(<BulkImportPanel {...defaultProps} showImport={true} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("placeholder", "hello;你好\ngoodbye;再见\nthank you;谢谢");
  });

  it("textarea is empty by default", () => {
    render(<BulkImportPanel {...defaultProps} showImport={true} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("");
  });

  it("Import Cards button has upload icon", () => {
    render(<BulkImportPanel {...defaultProps} showImport={true} />);
    const importBtn = screen.getByText("Import Cards").closest("button");
    expect(importBtn).toBeInTheDocument();
    // The lucide Upload icon renders as an SVG inside the button
    expect(importBtn?.querySelector("svg")).toBeInTheDocument();
  });
});
