/** Decorative meadow + castle scene (CSS/SVG, no external images). */
export function SceneBackground() {
  return (
    <div className="lr-scene" aria-hidden="true">
      <div className="lr-scene-sky" />
      <div className="lr-scene-sun" />
      <div className="lr-cloud lr-cloud-a" />
      <div className="lr-cloud lr-cloud-b" />
      <div className="lr-cloud lr-cloud-c" />
      <div className="lr-hill lr-hill-back" />
      <div className="lr-hill lr-hill-mid" />
      <div className="lr-castle">
        <div className="lr-castle-tower left" />
        <div className="lr-castle-body" />
        <div className="lr-castle-tower right" />
        <div className="lr-castle-door" />
      </div>
      <div className="lr-tree lr-tree-l" />
      <div className="lr-tree lr-tree-r" />
      <div className="lr-hill lr-hill-front" />
    </div>
  );
}
