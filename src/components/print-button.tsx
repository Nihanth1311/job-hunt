"use client";

import { Button, Icon } from "./ui";

export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Icon name="printer" /> Print / Save as PDF
    </Button>
  );
}
