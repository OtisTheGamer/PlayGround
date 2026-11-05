const FILES = {
  runnerA: "./assets/sprites/runner-a.svg",
  runnerB: "./assets/sprites/runner-b.svg",
  runnerC: "./assets/sprites/runner-c.svg",
  ogre: "./assets/sprites/ogre.svg",
  castle: "./assets/sprites/castle.svg",
  coin: "./assets/sprites/coin.svg",
  bomb: "./assets/sprites/bomb.svg",
  knife: "./assets/sprites/knife.svg",
  apple: "./assets/sprites/apple-gold.svg",
  snakeHead: "./assets/sprites/snake-head.svg",
  orbGreen: "./assets/sprites/orb-green.svg",
  orbRed: "./assets/sprites/orb-red.svg",
  dog: "./assets/sprites/dog.svg",
  bee: "./assets/sprites/bee.svg",
  cloud: "./assets/sprites/cloud.svg",
  bush: "./assets/sprites/bush.svg",
  flower: "./assets/sprites/flower.svg",
  survivor: "./assets/sprites/survivor.svg",
  slime: "./assets/sprites/slime.svg",
  gem: "./assets/sprites/gem.svg",
  fighter: "./assets/sprites/fighter.svg",
  eyeBoss: "./assets/sprites/eye-boss.svg",
};

const images = {};
let loaded = false;

export async function loadSprites() {
  if (loaded) return images;
  const entries = Object.entries(FILES);
  await Promise.all(
    entries.map(([key, src]) => new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { images[key] = img; resolve(); };
      img.onerror = () => { console.warn(`[adplay] sprite failed to load: ${src}`); resolve(); };
      img.src = src;
    }))
  );
  loaded = true;
  return images;
}

export function sprite(key) {
  return images[key] || null;
}

/**
 * Draw a sprite centered on x,y. Rotation 0 means the sprite's natural
 * orientation (most character sprites face right).
 */
export function drawSprite(ctx, key, x, y, size, opts = {}) {
  const img = images[key];
  if (!img) return false;
  const { rot = 0, alpha = 1, flipX = false, flipY = false, w = size, h = size } = opts;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

export { FILES as SPRITE_FILES };
