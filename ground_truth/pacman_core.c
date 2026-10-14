/*
 * ============================================================================
 * PAC-MAN CORE GAME ENGINE (Ground Truth Reference Implementation)
 * ============================================================================
 * Based on the authentic 1980 Toru Iwatani Namco arcade algorithms.
 * 
 * Features:
 *  - 28x36 Standard Tile Maze Layout with Tunnel Wrap-around
 *  - Authentic Deterministic Ghost AI Targeting:
 *      * Blinky (Shadow):  Direct Chase (Targets Pac-Man's exact tile)
 *      * Pinky  (Speedy):  Ambush (Targets 4 tiles ahead of Pac-Man)
 *      * Inky   (Bashful): Vector Flank (Doubles vector from Blinky to Pac-Man+2)
 *      * Clyde  (Pokey):   Threshold Logic (>8 tiles chases, <=8 retreats to corner)
 *  - Static Global Memory Tables for Direction & Scatter Coordinates
 *  - CLI JSON Interface for Headless Differential Fuzzing
 * ============================================================================
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define MAZE_WIDTH  28
#define MAZE_HEIGHT 36

/* Direction Constants: 0=UP, 1=LEFT, 2=DOWN, 3=RIGHT */
#define DIR_UP    0
#define DIR_LEFT  1
#define DIR_DOWN  2
#define DIR_RIGHT 3

/* Mode Constants */
#define MODE_CHASE      0
#define MODE_SCATTER    1
#define MODE_FRIGHTENED 2

/* ----------------------------------------------------------------------------
 * Global Memory Tables (In decompiled binaries, these become raw memory pointers)
 * ---------------------------------------------------------------------------- */
static int DIR_OFFSETS[4][2];      /* Address offset: DAT_00406080 */
static int SCATTER_CORNERS[4][2];  /* Address offset: DAT_004060C0 */
static int TABLES_INITIALIZED = 0;

/* Simplified Maze Bitmask (0 = Empty Path, 1 = Wall) */
static unsigned char MAZE[MAZE_HEIGHT][MAZE_WIDTH];

/* Game State Structure (Packed in memory at state_ptr) */
typedef struct {
    int pacman_x;
    int pacman_y;
    int pacman_dir;

    int blinky_x;
    int blinky_y;
    int blinky_dir;

    int pinky_x;
    int pinky_y;
    int pinky_dir;

    int inky_x;
    int inky_y;
    int inky_dir;

    int clyde_x;
    int clyde_y;
    int clyde_dir;

    int mode;              /* 0=CHASE, 1=SCATTER, 2=FRIGHTENED */
    int frightened_timer;
    int score;
    int lives;
    int game_over;
    int victory;
} GameState;

/* ----------------------------------------------------------------------------
 * Table Initialization
 * ---------------------------------------------------------------------------- */
void init_game_tables(void) {
    /* Direction Vectors: [0]=dx, [1]=dy */
    DIR_OFFSETS[DIR_UP][0]    =  0; DIR_OFFSETS[DIR_UP][1]    = -1;
    DIR_OFFSETS[DIR_LEFT][0]  = -1; DIR_OFFSETS[DIR_LEFT][1]  =  0;
    DIR_OFFSETS[DIR_DOWN][0]  =  0; DIR_OFFSETS[DIR_DOWN][1]  =  1;
    DIR_OFFSETS[DIR_RIGHT][0] =  1; DIR_OFFSETS[DIR_RIGHT][1] =  0;

    /* Scatter Target Corners:
     * Blinky: Top-Right (27, 0)
     * Pinky:  Top-Left  (0, 0)
     * Inky:   Bottom-Right (27, 35)
     * Clyde:  Bottom-Left (0, 35)
     */
    SCATTER_CORNERS[0][0] = 27; SCATTER_CORNERS[0][1] = 0;
    SCATTER_CORNERS[1][0] = 0;  SCATTER_CORNERS[1][1] = 0;
    SCATTER_CORNERS[2][0] = 27; SCATTER_CORNERS[2][1] = 35;
    SCATTER_CORNERS[3][0] = 0;  SCATTER_CORNERS[3][1] = 35;

    /* Initialize perimeter walls */
    memset(MAZE, 0, sizeof(MAZE));
    for (int x = 0; x < MAZE_WIDTH; x++) {
        MAZE[0][x] = 1;
        MAZE[MAZE_HEIGHT - 1][x] = 1;
    }
    for (int y = 0; y < MAZE_HEIGHT; y++) {
        if (y != 17) { /* Tunnel opening at row 17 */
            MAZE[y][0] = 1;
            MAZE[y][MAZE_WIDTH - 1] = 1;
        }
    }
    /* Ghost house obstacle */
    for (int x = 11; x <= 16; x++) {
        MAZE[15][x] = 1;
        MAZE[19][x] = 1;
    }
    for (int y = 15; y <= 19; y++) {
        MAZE[y][11] = 1;
        MAZE[y][16] = 1;
    }

    TABLES_INITIALIZED = 1;
}

/* ----------------------------------------------------------------------------
 * Collision & Geometry Helpers
 * ---------------------------------------------------------------------------- */
int check_wall_collision(int x, int y) {
    /* Handle Tunnel wrap-around at row 17 */
    if (y == 17) {
        if (x < 0 || x >= MAZE_WIDTH) return 0;
    }
    if (x < 0 || x >= MAZE_WIDTH || y < 0 || y >= MAZE_HEIGHT) {
        return 1;
    }
    return MAZE[y][x];
}

static double euclidean_distance_sq(int x1, int y1, int x2, int y2) {
    int dx = x1 - x2;
    int dy = y1 - y2;
    return (double)(dx * dx + dy * dy);
}

/* Find optimal next move towards a target tile (excluding 180-degree reversal) */
static int choose_next_ghost_dir(int cur_x, int cur_y, int cur_dir, int target_x, int target_y) {
    int best_dir = cur_dir;
    double min_dist = 1e9;
    int opposite_dir = (cur_dir + 2) % 4;

    /* Priority order standard in arcade: UP, LEFT, DOWN, RIGHT */
    int dirs[4] = { DIR_UP, DIR_LEFT, DIR_DOWN, DIR_RIGHT };

    for (int i = 0; i < 4; i++) {
        int d = dirs[i];
        if (d == opposite_dir) continue; /* No immediate 180-degree turn allowed */

        int next_x = cur_x + DIR_OFFSETS[d][0];
        int next_y = cur_y + DIR_OFFSETS[d][1];

        /* Tunnel wrapping */
        if (cur_y == 17) {
            if (next_x < 0) next_x = MAZE_WIDTH - 1;
            else if (next_x >= MAZE_WIDTH) next_x = 0;
        }

        if (!check_wall_collision(next_x, next_y)) {
            double d_sq = euclidean_distance_sq(next_x, next_y, target_x, target_y);
            if (d_sq < min_dist) {
                min_dist = d_sq;
                best_dir = d;
            }
        }
    }
    return best_dir;
}

/* ----------------------------------------------------------------------------
 * 1. Blinky AI (Shadow) - Direct Chase
 * ---------------------------------------------------------------------------- */
void update_blinky_ai(GameState *s) {
    if (!TABLES_INITIALIZED) init_game_tables();

    int target_x = s->pacman_x;
    int target_y = s->pacman_y;

    if (s->mode == MODE_SCATTER) {
        target_x = SCATTER_CORNERS[0][0];
        target_y = SCATTER_CORNERS[0][1];
    } else if (s->mode == MODE_FRIGHTENED) {
        /* Pseudo-random/flee */
        target_x = 27 - s->pacman_x;
        target_y = 35 - s->pacman_y;
    }

    s->blinky_dir = choose_next_ghost_dir(s->blinky_x, s->blinky_y, s->blinky_dir, target_x, target_y);
    s->blinky_x += DIR_OFFSETS[s->blinky_dir][0];
    s->blinky_y += DIR_OFFSETS[s->blinky_dir][1];

    /* Tunnel wrap */
    if (s->blinky_y == 17) {
        if (s->blinky_x < 0) s->blinky_x = MAZE_WIDTH - 1;
        else if (s->blinky_x >= MAZE_WIDTH) s->blinky_x = 0;
    }
}

/* ----------------------------------------------------------------------------
 * 2. Pinky AI (Speedy) - 4-Tile Ambush
 * ---------------------------------------------------------------------------- */
void update_pinky_ai(GameState *s) {
    if (!TABLES_INITIALIZED) init_game_tables();

    /* Target is 4 tiles ahead in Pac-Man's current orientation */
    int target_x = s->pacman_x + (DIR_OFFSETS[s->pacman_dir][0] * 4);
    int target_y = s->pacman_y + (DIR_OFFSETS[s->pacman_dir][1] * 4);

    if (s->mode == MODE_SCATTER) {
        target_x = SCATTER_CORNERS[1][0];
        target_y = SCATTER_CORNERS[1][1];
    }

    s->pinky_dir = choose_next_ghost_dir(s->pinky_x, s->pinky_y, s->pinky_dir, target_x, target_y);
    s->pinky_x += DIR_OFFSETS[s->pinky_dir][0];
    s->pinky_y += DIR_OFFSETS[s->pinky_dir][1];

    if (s->pinky_y == 17) {
        if (s->pinky_x < 0) s->pinky_x = MAZE_WIDTH - 1;
        else if (s->pinky_x >= MAZE_WIDTH) s->pinky_x = 0;
    }
}

/* ----------------------------------------------------------------------------
 * 3. Inky AI (Bashful) - Vector Flanking
 * ---------------------------------------------------------------------------- */
void update_inky_ai(GameState *s) {
    if (!TABLES_INITIALIZED) init_game_tables();

    /* Intermediate pivot: 2 tiles ahead of Pac-Man */
    int pivot_x = s->pacman_x + (DIR_OFFSETS[s->pacman_dir][0] * 2);
    int pivot_y = s->pacman_y + (DIR_OFFSETS[s->pacman_dir][1] * 2);

    /* Vector from Blinky to pivot, doubled */
    int vec_x = pivot_x - s->blinky_x;
    int vec_y = pivot_y - s->blinky_y;
    int target_x = s->blinky_x + (vec_x * 2);
    int target_y = s->blinky_y + (vec_y * 2);

    if (s->mode == MODE_SCATTER) {
        target_x = SCATTER_CORNERS[2][0];
        target_y = SCATTER_CORNERS[2][1];
    }

    s->inky_dir = choose_next_ghost_dir(s->inky_x, s->inky_y, s->inky_dir, target_x, target_y);
    s->inky_x += DIR_OFFSETS[s->inky_dir][0];
    s->inky_y += DIR_OFFSETS[s->inky_dir][1];

    if (s->inky_y == 17) {
        if (s->inky_x < 0) s->inky_x = MAZE_WIDTH - 1;
        else if (s->inky_x >= MAZE_WIDTH) s->inky_x = 0;
    }
}

/* ----------------------------------------------------------------------------
 * 4. Clyde AI (Pokey) - Distance Threshold Switch
 * ---------------------------------------------------------------------------- */
void update_clyde_ai(GameState *s) {
    if (!TABLES_INITIALIZED) init_game_tables();

    double dist_sq = euclidean_distance_sq(s->clyde_x, s->clyde_y, s->pacman_x, s->pacman_y);
    int target_x, target_y;

    /* If distance > 8.0 tiles (dist_sq > 64), chase Pac-Man.
     * If distance <= 8.0 tiles, coward retreat to bottom-left corner. */
    if (dist_sq > 64.0 && s->mode != MODE_SCATTER) {
        target_x = s->pacman_x;
        target_y = s->pacman_y;
    } else {
        target_x = SCATTER_CORNERS[3][0];
        target_y = SCATTER_CORNERS[3][1];
    }

    s->clyde_dir = choose_next_ghost_dir(s->clyde_x, s->clyde_y, s->clyde_dir, target_x, target_y);
    s->clyde_x += DIR_OFFSETS[s->clyde_dir][0];
    s->clyde_y += DIR_OFFSETS[s->clyde_dir][1];

    if (s->clyde_y == 17) {
        if (s->clyde_x < 0) s->clyde_x = MAZE_WIDTH - 1;
        else if (s->clyde_x >= MAZE_WIDTH) s->clyde_x = 0;
    }
}

/* ----------------------------------------------------------------------------
 * Core Engine Tick Function
 * ---------------------------------------------------------------------------- */
void tick_engine(GameState *s, int action_dir) {
    if (!TABLES_INITIALIZED) init_game_tables();

    /* Update Pac-Man direction if not blocked */
    if (action_dir >= 0 && action_dir <= 3) {
        int nx = s->pacman_x + DIR_OFFSETS[action_dir][0];
        int ny = s->pacman_y + DIR_OFFSETS[action_dir][1];
        if (!check_wall_collision(nx, ny)) {
            s->pacman_dir = action_dir;
        }
    }

    /* Move Pac-Man */
    int next_px = s->pacman_x + DIR_OFFSETS[s->pacman_dir][0];
    int next_py = s->pacman_y + DIR_OFFSETS[s->pacman_dir][1];
    if (next_py == 17) {
        if (next_px < 0) next_px = MAZE_WIDTH - 1;
        else if (next_px >= MAZE_WIDTH) next_px = 0;
    }
    if (!check_wall_collision(next_px, next_py)) {
        s->pacman_x = next_px;
        s->pacman_y = next_py;
        s->score += 10; /* 10 pts per standard dot step */
    }

    /* Update All 4 Ghosts */
    update_blinky_ai(s);
    update_pinky_ai(s);
    update_inky_ai(s);
    update_clyde_ai(s);

    /* Evaluate Collisions */
    int caught = 0;
    if (s->pacman_x == s->blinky_x && s->pacman_y == s->blinky_y) caught = 1;
    if (s->pacman_x == s->pinky_x  && s->pacman_y == s->pinky_y)  caught = 1;
    if (s->pacman_x == s->inky_x   && s->pacman_y == s->inky_y)   caught = 1;
    if (s->pacman_x == s->clyde_x  && s->pacman_y == s->clyde_y)  caught = 1;

    if (caught) {
        if (s->mode == MODE_FRIGHTENED) {
            s->score += 200; /* Eaten ghost bonus */
        } else {
            s->lives--;
            if (s->lives <= 0) s->game_over = 1;
        }
    }

    if (s->frightened_timer > 0) {
        s->frightened_timer--;
        if (s->frightened_timer == 0) s->mode = MODE_CHASE;
    }
}

/* ----------------------------------------------------------------------------
 * CLI JSON Interface (Headless Runner for Differential Testing)
 * ---------------------------------------------------------------------------- */
int main(int argc, char **argv) {
    init_game_tables();

    GameState s;
    memset(&s, 0, sizeof(GameState));
    s.lives = 3;
    s.mode = MODE_CHASE;

    /* Default Positions */
    s.pacman_x = 14; s.pacman_y = 26; s.pacman_dir = DIR_LEFT;
    s.blinky_x = 14; s.blinky_y = 11; s.blinky_dir = DIR_LEFT;
    s.pinky_x  = 14; s.pinky_y = 14; s.pinky_dir = DIR_DOWN;
    s.inky_x   = 12; s.inky_y = 14; s.inky_dir = DIR_UP;
    s.clyde_x  = 16; s.clyde_y = 14; s.clyde_dir = DIR_UP;

    int action = -1;

    /* Parse CLI Arguments: e.g. --px 14 --py 20 --pdir 1 --bx 14 --by 10 --action 1 */
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--px") == 0 && i + 1 < argc) s.pacman_x = atoi(argv[++i]);
        else if (strcmp(argv[i], "--py") == 0 && i + 1 < argc) s.pacman_y = atoi(argv[++i]);
        else if (strcmp(argv[i], "--pdir") == 0 && i + 1 < argc) s.pacman_dir = atoi(argv[++i]);
        else if (strcmp(argv[i], "--bx") == 0 && i + 1 < argc) s.blinky_x = atoi(argv[++i]);
        else if (strcmp(argv[i], "--by") == 0 && i + 1 < argc) s.blinky_y = atoi(argv[++i]);
        else if (strcmp(argv[i], "--bdir") == 0 && i + 1 < argc) s.blinky_dir = atoi(argv[++i]);
        else if (strcmp(argv[i], "--pinky_x") == 0 && i + 1 < argc) s.pinky_x = atoi(argv[++i]);
        else if (strcmp(argv[i], "--pinky_y") == 0 && i + 1 < argc) s.pinky_y = atoi(argv[++i]);
        else if (strcmp(argv[i], "--inky_x") == 0 && i + 1 < argc) s.inky_x = atoi(argv[++i]);
        else if (strcmp(argv[i], "--inky_y") == 0 && i + 1 < argc) s.inky_y = atoi(argv[++i]);
        else if (strcmp(argv[i], "--clyde_x") == 0 && i + 1 < argc) s.clyde_x = atoi(argv[++i]);
        else if (strcmp(argv[i], "--clyde_y") == 0 && i + 1 < argc) s.clyde_y = atoi(argv[++i]);
        else if (strcmp(argv[i], "--mode") == 0 && i + 1 < argc) s.mode = atoi(argv[++i]);
        else if (strcmp(argv[i], "--action") == 0 && i + 1 < argc) action = atoi(argv[++i]);
    }

    tick_engine(&s, action);

    /* Output Deterministic JSON Response */
    printf("{\"status\":\"OK\",\"pacman\":{\"x\":%d,\"y\":%d,\"dir\":%d},"
           "\"blinky\":{\"x\":%d,\"y\":%d,\"dir\":%d},"
           "\"pinky\":{\"x\":%d,\"y\":%d,\"dir\":%d},"
           "\"inky\":{\"x\":%d,\"y\":%d,\"dir\":%d},"
           "\"clyde\":{\"x\":%d,\"y\":%d,\"dir\":%d},"
           "\"score\":%d,\"lives\":%d,\"mode\":%d,\"game_over\":%d}\n",
           s.pacman_x, s.pacman_y, s.pacman_dir,
           s.blinky_x, s.blinky_y, s.blinky_dir,
           s.pinky_x, s.pinky_y, s.pinky_dir,
           s.inky_x, s.inky_y, s.inky_dir,
           s.clyde_x, s.clyde_y, s.clyde_dir,
           s.score, s.lives, s.mode, s.game_over);

    return 0;
}
