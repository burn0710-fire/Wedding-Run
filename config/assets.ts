// config/assets.ts

// base は "/" または "/Wedding-Run/" のどちらにもなる。
// import.meta.env.BASE_URL を先頭につければ両対応できる。
const IMAGE_BASE = "assets/images";

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
    GROUND_SMALL: {
      path: `${IMAGE_BASE}/obstacle_s.png`,
      width: 113,
      height: 144,
    },
    GROUND_LARGE: {
      path: `${IMAGE_BASE}/obstacle_l.png`,
      width: 118,
      height: 279,
    },
    FLYING_SMALL: {
      path: `${IMAGE_BASE}/obstacle_fly_s.png`,
      width: 343,
      height: 203,
    },
    FLYING_LARGE: {
      path: `${IMAGE_BASE}/obstacle_fly_l.png`,
      width: 343,
      height: 203,
    },
  },

  PLAYER: {
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
      JUMP: {
        path: `${IMAGE_BASE}/chara_1.png`,
        width: 647,
        height: 453,
      },
      DIE: {
        path: `${IMAGE_BASE}/chara_3.png`,
        width: 647,
        height: 453,
      },
    },
  },
};

export default assetConfig;
