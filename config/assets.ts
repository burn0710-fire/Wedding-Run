// アセットのパスと設定を一元管理
// 画像ファイルを差し替える場合は、このファイルのパスまたはフォルダ内のファイルを変更してください。

export const ASSETS = {
  // 背景画像の設定
  BACKGROUND: {
    // 遠景（山など）: ゆっくり動く
    FAR: {
      path: '/assets/images/bg_far.png',
      width: 1000, // 画像の元の幅
      height: 300, // 画像の元の高さ
    },
    // 中景（木々など）: 普通に動く
    MID: {
      path: '/assets/images/bg_mid.png',
      width: 1000,
      height: 300,
    }
  },

  // 地面の画像
  GROUND: {
    path: '/assets/images/ground.png',
  },

  // プレイヤーの設定
  PLAYER: {
    // 簡易的なPNG差し替え用（Spine導入までのつなぎ、または静止画用）
    IMAGE_PATH: '/assets/images/player.png',
    
    // Spineデータ（将来的な実装用、またはライブラリ導入時に使用）
    // 配置場所: public/assets/spine/player/
    SPINE: {
      ATLAS: '/assets/spine/player/character.atlas',
      JSON: '/assets/spine/player/character.json',
      PNG: '/assets/spine/player/character.png',
      // アニメーション名の定義（Spineデータのアニメーション名と合わせる）
      ANIMATIONS: {
        RUN: 'run',
        JUMP: 'jump',
        IDLE: 'idle',
        DIE: 'die'
      },
      SCALE: 0.5, // Spine描画時のスケール調整
    }
  },

  // 障害物の画像設定
  // 画像がない場合は、自動的にデフォルトの矩形描画になります
  OBSTACLES: {
    GROUND_SMALL: {
      path: '/assets/images/obs_ground_small.png',
      scale: 1.0, 
    },
    GROUND_LARGE: {
      path: '/assets/images/obs_ground_large.png',
      scale: 1.0,
    },
    FLYING_SMALL: {
      path: '/assets/images/obs_fly_small.png',
      scale: 1.0,
    },
    FLYING_LARGE: {
      path: '/assets/images/obs_fly_large.png',
      scale: 1.0,
    }
  }
};

export default ASSETS;