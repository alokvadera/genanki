// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import PreviewModal from "./PreviewModal";
import type { AnkiCard } from "@/lib/anki";

const mockCard: AnkiCard = {
  front: "What is photosynthesis?",
  back: "The process by which plants convert light into energy",
};

const noop = () => {};

describe("PreviewModal", () => {
  const defaultProps = {
    previewCard: null,
    onClose: noop,
  };

  it("does not render when previewCard is null", () => {
    render(<PreviewModal {...defaultProps} />);
    expect(screen.queryByText("What is photosynthesis?")).not.toBeInTheDocument();
    expect(screen.queryByText("Front")).not.toBeInTheDocument();
    expect(screen.queryByText("Back")).not.toBeInTheDocument();
  });

  it("renders the modal with front and back when previewCard is set", () => {
    render(<PreviewModal {...defaultProps} previewCard={mockCard} />);
    expect(screen.getByText("What is photosynthesis?")).toBeInTheDocument();
    expect(screen.getByText("The process by which plants convert light into energy")).toBeInTheDocument();
    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("renders the Close Preview button", () => {
    render(<PreviewModal {...defaultProps} previewCard={mockCard} />);
    expect(screen.getByText("Close Preview")).toBeInTheDocument();
  });

  it("calls onClose when Close Preview button is clicked", () => {
    const onClose = vi.fn();
    render(<PreviewModal {...defaultProps} previewCard={mockCard} onClose={onClose} />);
    fireEvent.click(screen.getByText("Close Preview"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking the backdrop (outside the card)", () => {
    const onClose = vi.fn();
    render(<PreviewModal {...defaultProps} previewCard={mockCard} onClose={onClose} />);
    // Click the backdrop (the fixed inset-0 container)
    const backdrop = screen.getByText("What is photosynthesis?").closest("[class*='fixed']");
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose when clicking inside the card content (stopPropagation)", () => {
    const onClose = vi.fn();
    render(<PreviewModal {...defaultProps} previewCard={mockCard} onClose={onClose} />);
    // Click the card content area directly
    const cardContent = screen.getByText("What is photosynthesis?").closest("[class*='nb-border']");
    expect(cardContent).toBeInTheDocument();
    fireEvent.click(cardContent!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders Front and Back labels", () => {
    render(<PreviewModal {...defaultProps} previewCard={mockCard} />);
    const frontLabels = screen.getAllByText("Front");
    const backLabels = screen.getAllByText("Back");
    expect(frontLabels.length).toBeGreaterThanOrEqual(1);
    expect(backLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("handles cards with special characters in front and back", () => {
    const specialCard: AnkiCard = {
      front: "What is <html> & \"quotes\"?",
      back: "Script: <script>alert('xss')</script> & entities",
    };
    render(<PreviewModal {...defaultProps} previewCard={specialCard} />);
    // React escapes HTML so <script> should be displayed as text, not executed
    expect(screen.getByText("What is <html> & \"quotes\"?")).toBeInTheDocument();
    expect(screen.getByText("Script: <script>alert('xss')</script> & entities")).toBeInTheDocument();
  });

  it("renders front card in a secondary background box", () => {
    render(<PreviewModal {...defaultProps} previewCard={mockCard} />);
    const frontBox = screen.getByText("What is photosynthesis?").closest("[class*='bg-secondary']");
    expect(frontBox).toBeInTheDocument();
  });

  it("renders back card in a white background box", () => {
    render(<PreviewModal {...defaultProps} previewCard={mockCard} />);
    const backBox = screen.getByText("The process by which plants convert light into energy").closest("[class*='bg-white']");
    expect(backBox).toBeInTheDocument();
  });
});
