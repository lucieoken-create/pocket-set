// Replace these individual PNGs to personalize your fork. See docs/design/MAKE_IT_YOURS.md.
export const poses=['total-body','chest-back','arms','lower-body','abs-ass','upper-body'];
export const posePath=(pose=0)=>`assets/characters/${poses[pose]??poses[0]}.png`;
export const portraitPath=(happy=false)=>`assets/characters/${happy?'celebrate':'profile'}.png`;
