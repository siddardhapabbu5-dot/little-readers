import { useMemo } from "react";
import { View } from "react-native";
import QRCode from "qrcode";

/** QR drawn with plain Views: one View per run of dark modules in a row. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const runs = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    const out: Array<{ row: number; col: number; len: number }> = [];
    for (let row = 0; row < modules.size; row += 1) {
      let col = 0;
      while (col < modules.size) {
        if (!modules.get(row, col)) {
          col += 1;
          continue;
        }
        const start = col;
        while (col < modules.size && modules.get(row, col)) col += 1;
        out.push({ row, col: start, len: col - start });
      }
    }
    return { count: modules.size, out };
  }, [value]);

  const quiet = 2;
  const cell = size / (runs.count + quiet * 2);
  return (
    <View style={{ width: size, height: size, backgroundColor: "#fff" }}>
      {runs.out.map((r, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            backgroundColor: "#000",
            top: (r.row + quiet) * cell,
            left: (r.col + quiet) * cell,
            width: r.len * cell + 0.5,
            height: cell + 0.5,
          }}
        />
      ))}
    </View>
  );
}
