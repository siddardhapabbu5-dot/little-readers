import type { ImageSourcePropType } from "react-native";
import type { ActivityCode } from "@little-readers/shared";
import { colors } from "../theme";

export const art = {
  heroKids: require("../assets/illustrations/hero-kids.png"),
  trophy: require("../assets/illustrations/trophy.png"),
  certificate: require("../assets/illustrations/certificate.png"),
  starGoal: require("../assets/illustrations/star-goal.png"),
  revision: require("../assets/illustrations/act-revision.png"),
  listen: require("../assets/illustrations/act-listen.png"),
  spell: require("../assets/illustrations/act-spell.png"),
  match: require("../assets/illustrations/act-match.png"),
  quiz: require("../assets/illustrations/act-quiz.png"),
  surprise: require("../assets/illustrations/act-surprise.png"),
} satisfies Record<string, ImageSourcePropType>;

type CategoryTheme = { image: ImageSourcePropType; tint: string };

/** Admin names categories freely, so match on keywords rather than exact labels. */
const CATEGORY_THEMES: Array<{ match: RegExp; theme: CategoryTheme }> = [
  { match: /family|people|person/i, theme: { image: require("../assets/illustrations/cat-family.png"), tint: colors.pinkSoft } },
  { match: /animal|bird|pet|insect/i, theme: { image: require("../assets/illustrations/cat-animals.png"), tint: colors.yellowSoft } },
  { match: /fruit|vegetable|veggie/i, theme: { image: require("../assets/illustrations/cat-fruits.png"), tint: colors.greenSoft } },
  { match: /colou?r|shape/i, theme: { image: require("../assets/illustrations/cat-colors.png"), tint: colors.skySoft } },
  { match: /body/i, theme: { image: require("../assets/illustrations/cat-body.png"), tint: colors.orangeSoft } },
  { match: /school|class/i, theme: { image: require("../assets/illustrations/cat-school.png"), tint: colors.primarySoft } },
  { match: /house|home/i, theme: { image: require("../assets/illustrations/cat-household.png"), tint: colors.cream } },
  { match: /food|drink|snack/i, theme: { image: require("../assets/illustrations/cat-food.png"), tint: colors.orangeSoft } },
  { match: /nature|environment|weather|plant/i, theme: { image: require("../assets/illustrations/cat-nature.png"), tint: colors.greenSoft } },
  { match: /action|verb|move/i, theme: { image: require("../assets/illustrations/cat-action.png"), tint: colors.pinkSoft } },
];

const FALLBACK_TINTS = [colors.skySoft, colors.yellowSoft, colors.greenSoft, colors.pinkSoft, colors.primarySoft, colors.orangeSoft];

export function categoryTheme(label: string, index = 0): { image: ImageSourcePropType | null; tint: string } {
  const hit = CATEGORY_THEMES.find((c) => c.match.test(label));
  return hit ? hit.theme : { image: null, tint: FALLBACK_TINTS[index % FALLBACK_TINTS.length] };
}

export const ACTIVITY_ART: Record<ActivityCode, { image: ImageSourcePropType; tint: string; accent: string }> = {
  LISTEN: { image: art.listen, tint: colors.skySoft, accent: colors.sky },
  SPELL: { image: art.spell, tint: colors.yellowSoft, accent: colors.orange },
  MATCH_IT: { image: art.match, tint: colors.greenSoft, accent: colors.green },
  QUIZ_TIME: { image: art.quiz, tint: colors.orangeSoft, accent: colors.orange },
  SURPRISE: { image: art.surprise, tint: colors.pinkSoft, accent: colors.pink },
};
