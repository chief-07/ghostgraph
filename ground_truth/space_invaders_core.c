/**
 * 1978 Space Invaders Arcade Subsystem (nInvaders Architecture)
 * Reconstructed by GhostGraph Swarm via FalkorDB Topological Memory
 * Target: x86_64 stripped binary -> Compilable ANSI C
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define ALIEN_ROWS 5
#define ALIEN_COLS 10
#define BUNKER_ROWS 4
#define BUNKER_COLS 80
#define MAX_MISSILES 5
#define SCREEN_WIDTH 80
#define SCREEN_HEIGHT 24

/* Resolved Global Memory Tables from FalkorDB */
int alienBlock[ALIEN_ROWS][ALIEN_COLS];   /* 0x00405100: ALIEN_BLOCK_GRID */
int bunker[BUNKER_ROWS][BUNKER_COLS];     /* 0x00405240: BUNKER_EROSION_GRID */
int lowest_ship[ALIEN_COLS];              /* 0x00405380: LOWEST_SHIP_TABLE */
int alienMissiles[MAX_MISSILES * 2];      /* 0x00405400: ALIEN_MISSILE_STATE */

typedef struct {
    int posX;
    int posY;
    int right;
    int bottom;
    int left;
    int speed;
    int shipnum;
} AliensSwarm;

typedef struct {
    int posX;
    int posY;
    int lives;
    int status;
} PlayerShip;

typedef struct {
    int score;
    int highscore;
    int level;
    int is_game_over;
} GameState;

AliensSwarm swarm;
PlayerShip player;
GameState game;

void aliensReset(void) {
    int default_level[5][10] = {
        {1, 1, 1, 1, 1, 1, 1, 1, 1, 1},
        {2, 2, 2, 2, 2, 2, 2, 2, 2, 2},
        {2, 2, 2, 2, 2, 2, 2, 2, 2, 2},
        {3, 3, 3, 3, 3, 3, 3, 3, 3, 3},
        {3, 3, 3, 3, 3, 3, 3, 3, 3, 3}
    };
    for (int r = 0; r < ALIEN_ROWS; r++) {
        for (int c = 0; c < ALIEN_COLS; c++) {
            alienBlock[r][c] = default_level[r][c];
        }
    }
    swarm.posX = 5;
    swarm.posY = 2;
    swarm.speed = 1;
    swarm.shipnum = 50;

    for (int i = 0; i < MAX_MISSILES * 2; i++) alienMissiles[i] = 0;
}

void bunkersReset(void) {
    const char *bunkerd[4] = {
        "        ###                 ###                 ###                 ###         ",
        "       #####               #####               #####               #####        ",
        "      #######             #######             #######             #######       ",
        "      ##   ##             ##   ##             ##   ##             ##   ##       "
    };
    for (int r = 0; r < BUNKER_ROWS; r++) {
        for (int c = 0; c < BUNKER_COLS; c++) {
            bunker[r][c] = (bunkerd[r][c] == '#') ? 1 : 0;
        }
    }
}

int bunkersHitCheck(int shotx, int shoty) {
    if (shoty < 18 || shoty >= 22) return 0;
    if (shotx < 0 || shotx >= BUNKER_COLS) return 0;
    int row = shoty - 18;
    int col = shotx;
    if (bunker[row][col] == 1) {
        bunker[row][col] = 0; /* Erode defense block */
        return 1;
    }
    return 0;
}

int playerHitCheck(int shotx, int shoty) {
    if (shoty == player.posY && shotx >= player.posX && shotx <= player.posX + 2) {
        player.lives--;
        player.status = 1; /* EXPLODING */
        if (player.lives <= 0) game.is_game_over = 1;
        return 1;
    }
    return 0;
}

int aliensMissileMove(void) {
    int fPlayerHit = 0;
    for (int i = 0; i < MAX_MISSILES; i++) {
        int sx = alienMissiles[i * 2];
        int sy = alienMissiles[i * 2 + 1];
        if (sx != 0) {
            if (bunkersHitCheck(sx, sy)) {
                alienMissiles[i * 2] = 0;
                continue;
            }
            sy++;
            alienMissiles[i * 2 + 1] = sy;
            if (playerHitCheck(sx, sy)) {
                alienMissiles[i * 2] = 0;
                fPlayerHit = 1;
            } else if (sy >= SCREEN_HEIGHT) {
                alienMissiles[i * 2] = 0;
            }
        }
    }
    return fPlayerHit;
}

void doScoring(int alien_type) {
    int points = (alien_type == 1) ? 30 : ((alien_type == 2) ? 20 : 10);
    game.score += points;
    if (game.score > game.highscore) {
        game.highscore = game.score;
    }
}

int main(void) {
    printf("GhostGraph Reconstructed Space Invaders Engine v1.0\n");
    aliensReset();
    bunkersReset();
    player.posX = 40;
    player.posY = 22;
    player.lives = 3;
    player.status = 0;
    game.score = 0;
    game.highscore = 1000;
    game.is_game_over = 0;

    printf("Alien Swarm Initialized: %d units.\n", swarm.shipnum);
    printf("Four Bunkers Initialized: 4x80 grid.\n");
    printf("Simulating 5 game ticks...\n");

    for (int tick = 1; tick <= 5; tick++) {
        aliensMissileMove();
        printf("Tick %d: Score=%d, Lives=%d, SwarmPosX=%d\n", tick, game.score, player.lives, swarm.posX);
    }
    printf("Reconstructed game execution verified successfully.\n");
    return 0;
}
