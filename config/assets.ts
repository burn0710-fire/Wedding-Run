// config/assets.ts

// 画像のベースパス（GitHub Pages で /Wedding-Run/ 配下に出す前提）
const IMAGE_BASE = "/assets/images";

const assetConfig = {
  BACKGROUND: {
    FAR: {
      path: `${IMAGE_BASE}/bg_far.png`,
      width: 800,
      height: 533,
    },
    MID: {
      path: `${IMAGE_BASE}/bg_mid.png`,
      width: 800,
      height: 533,
    },
  },

  GROUND: {
    path: `${IMAGE_BASE}/ground.png`,
    width: 744,
    height: 144,
  },

  OBSTACLES: {
    // 地上の小さい障害物
    GROUND_SMALL: {
      path: `${IMAGE_BASE}/obstacle_s.png`,
      width: 113,
      height: 144,
    },
    // 地上の大きい障害物
    GROUND_LARGE: {
      path: `${IMAGE_BASE}/obstacle_l.png`,
      width: 118,
      height: 279,
    },
    // 空中の小さい障害物
    FLYING_SMALL: {
      path: `${IMAGE_BASE}/obstacle_fly_s.png`,
      width: 343,
      height: 203,
    },
    // 空中の大きい障害物
    FLYING_LARGE: {
      path: `${IMAGE_BASE}/obstacle_fly_l.png`,
      width: 343,
      height: 203,
    },
  },

  PLAYER: {
    // いまは使わないけど、古いコードが参照しても落ちないようにダミー定義だけ残しておく
    SPINE: {
      BASE: "/Wedding-Run/assets/spine/player/",
      JSON: "player.json",
      ATLAS: "player.atlas",
      SCALE: 0.4,
      ANIMATIONS: {
        RUN: "run",
        JUMP: "jump",
        DIE: "die",
      },
    },

    // ★ここが今回追加したスプライトアニメ用設定
    SPRITES: {
      RUN_1: {
        path: `${IMAGE_BASE}/chara_1.png`,
        width: 647,
        height: 453,
      },
      RUN_2: {
        path: `${IMAGE_BASE}/chara_2.png`,
        width: 647,
        height: 453,
      },
      // JUMP は chara_1 をそのまま使う想定
      JUMP: {
        path: `${IMAGE_BASE}/chara_1.png`,
        width: 647,
        height: 453,
      },
      // DIE だけ chara_3
      DIE: {
        path: `${IMAGE_BASE}/chara_3.png`,
        width: 647,
        height: 453,
      },
    },
  },
} as const;

export default assetConfig;
