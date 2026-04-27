"use client";

import { useRef, useEffect, useCallback } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import type { SankeyData } from "@/lib/payroll-employee-helpers";
import { formatCOP } from "@/lib/payroll-helpers";

interface Props {
  data: SankeyData;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
}

// Colors per category
const NODE_COLOR: Record<string, string> = {
  origin: "hsl(221, 83%, 53%)",       // blue-primary
  hub: "hsl(262, 83%, 58%)",           // purple accent
  "destination:bank": "hsl(142, 71%, 45%)", // green
  "destination:deduction": "hsl(0, 84%, 60%)", // red
};

function nodeColor(category: string, nodeId: string): string {
  if (category === "destination") {
    return nodeId === "dest:bank"
      ? NODE_COLOR["destination:bank"]
      : NODE_COLOR["destination:deduction"];
  }
  return NODE_COLOR[category] ?? "hsl(215, 20%, 65%)";
}

export function PayrollSankey({ data, height = 400, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Clear previous render
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    if (data.nodes.length === 0) return;

    const width = svg.clientWidth || 700;
    const margin = { top: 16, right: 16, bottom: 16, left: 16 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // Build d3-sankey input
    // d3-sankey mutates the nodes/links, so we deep-copy
    type D3Node = {
      id: string;
      label: string;
      value: number;
      category: string;
      // d3-sankey fills these:
      x0?: number; x1?: number; y0?: number; y1?: number; index?: number;
    };
    type D3Link = {
      source: string | D3Node;
      target: string | D3Node;
      value: number;
      width?: number;
    };

    const sankeyNodes: D3Node[] = data.nodes.map((n) => ({ ...n }));
    const nodeIndex = new Map(sankeyNodes.map((n, i) => [n.id, i]));
    const sankeyLinks: D3Link[] = (data.links
      .filter(
        (l) =>
          nodeIndex.has(l.source) &&
          nodeIndex.has(l.target) &&
          l.value > 0
      )
      .map((l) => ({
        source: nodeIndex.get(l.source) as unknown as D3Node,
        target: nodeIndex.get(l.target) as unknown as D3Node,
        value: l.value,
      })) as unknown) as D3Link[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sankeyLayout = (sankey as any)()
      .nodeId((d: D3Node) => d.index ?? 0)
      .nodeWidth(18)
      .nodePadding(14)
      .extent([
        [margin.left, margin.top],
        [margin.left + innerW, margin.top + innerH],
      ]);

    let graph: { nodes: D3Node[]; links: D3Link[] };
    try {
      graph = sankeyLayout({ nodes: sankeyNodes, links: sankeyLinks });
    } catch {
      return;
    }

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(g);

    // Link path generator
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkPath = sankeyLinkHorizontal() as any;

    // Draw links
    for (const link of graph.links) {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("d", linkPath(link) ?? "");
      path.setAttribute("fill", "none");
      path.setAttribute(
        "stroke",
        "hsl(215, 20%, 65%)"
      );
      path.setAttribute("stroke-opacity", "0.35");
      path.setAttribute("stroke-width", String(Math.max(1, link.width ?? 1)));
      g.appendChild(path);
    }

    // Draw nodes
    for (const node of graph.nodes) {
      if (
        node.x0 === undefined ||
        node.x1 === undefined ||
        node.y0 === undefined ||
        node.y1 === undefined
      )
        continue;

      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      const color = nodeColor(node.category, node.id);
      rect.setAttribute("x", String(node.x0));
      rect.setAttribute("y", String(node.y0));
      rect.setAttribute("width", String(node.x1 - node.x0));
      rect.setAttribute("height", String(Math.max(1, node.y1 - node.y0)));
      rect.setAttribute("fill", color);
      rect.setAttribute("rx", "3");
      if (onNodeClick) {
        rect.style.cursor = "pointer";
        rect.setAttribute("aria-label", node.label);
        rect.setAttribute("role", "button");
        rect.addEventListener("click", () => onNodeClick(node.id));
      }
      g.appendChild(rect);

      // Label
      const isRight = node.x0 > innerW / 2;
      const tx = isRight ? node.x0 - 6 : (node.x1 ?? node.x0) + 6;
      const ty = (node.y0 + (node.y1 ?? node.y0)) / 2;

      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      text.setAttribute("x", String(tx));
      text.setAttribute("y", String(ty));
      text.setAttribute("dy", "0.35em");
      text.setAttribute("text-anchor", isRight ? "end" : "start");
      text.setAttribute("font-size", "11");
      text.setAttribute("fill", "currentColor");
      text.setAttribute("pointer-events", "none");
      text.textContent = `${node.label} ${formatCOP(node.value)}`;
      g.appendChild(text);
    }
  }, [data, height, onNodeClick]);

  useEffect(() => {
    draw();
    const obs = new ResizeObserver(draw);
    if (svgRef.current?.parentElement) obs.observe(svgRef.current.parentElement);
    return () => obs.disconnect();
  }, [draw]);

  if (data.nodes.length === 0) {
    return (
      <div className="hidden md:flex items-center justify-center h-24 text-muted-foreground text-sm">
        Sin datos
      </div>
    );
  }

  return (
    <div className="hidden md:block w-full overflow-hidden">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        aria-label="Diagrama Sankey de distribución del pago"
        role="img"
        className="text-foreground"
      />
    </div>
  );
}
