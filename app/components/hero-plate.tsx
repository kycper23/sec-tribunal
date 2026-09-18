/**
 * The frontispiece plate: an illustrated engraving above the title page,
 * the way an old law volume would open with a full-page scene before the
 * masthead. Generated once via src/gen-assets.ts (see scene-hero.jpg),
 * never regenerated per-render — purely decorative, no data inside it.
 */
export function HeroPlate() {
  return (
    <figure className="hero-plate">
      <img src="/scene-hero.jpg" alt="The council of sages, engraved frontispiece" />
      <figcaption>Frontispiece · The Tribunal in Session</figcaption>
    </figure>
  )
}
