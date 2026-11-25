import { cn } from "@livepeer/ui";
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Geist Mono, for ids, amounts and times. */
  mono?: boolean;
  /** Hidden below the medium breakpoint. */
  wide?: boolean;
}

export interface TableProps<T> {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => string;
  caption: string;
  empty: ReactNode;
}

/** The console's table: dense, hairline-divided, set into a card. Same tokens as the user app. */
export function Table<T>({ columns, rows, rowKey, caption, empty }: TableProps<T>) {
  if (rows.length === 0) {
    return <div className="rounded-card border border-dashed border-input px-6 py-12 text-center text-[13px] text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-card border border-hairline bg-card">
      <table className="w-full border-collapse text-[13px] leading-[18px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-hairline text-left text-[11px] font-medium uppercase tracking-[0.04em] text-subtle-foreground">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn("h-9 whitespace-nowrap px-3 font-medium first:pl-4 last:pr-4", column.align === "right" && "text-right", column.wide && "hidden md:table-cell")}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors duration-150 hover:bg-hover">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    // The height keeps one-line rows dense; the padding is what a two-line cell gets to breathe.
                    "h-10 px-3 py-2 align-middle first:pl-4 last:pr-4",
                    column.align === "right" && "text-right",
                    column.mono && "whitespace-nowrap font-mono text-[12px] text-muted-foreground",
                    column.wide && "hidden md:table-cell",
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
