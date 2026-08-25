// Dot de linha que destaca meses com anotação (checkpoint) nos gráficos.
// Factory (não componente): recebe o índice byMes e como resolver o ano_mes
// do ponto, devolve o componente de dot que o recharts renderiza.
export function makeCheckpointDot(opts) {
  return function CheckpointDot(props) {
    const { cx, cy, payload, dataKey } = props;
    if (cx === undefined || cy === undefined || !payload) return null;
    const am = opts.resolve(payload, dataKey);
    const has = !!am && opts.byMes.has(am);
    const color = props.stroke ?? opts.baseColor;
    if (has) {
      return (
        <g>
          <circle cx={cx} cy={cy} r={6} fill={color} stroke="white" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={2} fill="white" />
        </g>
      );
    }
    return <circle cx={cx} cy={cy} r={2.5} fill={color} />;
  };
}
