#include <stdbool.h>

typedef struct GameState {
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
    int mode;
    int frightened_timer;
} GameState;

/* Direction vectors: 0: UP, 1: LEFT, 2: DOWN, 3: RIGHT */
extern int DIR_OFFSETS[4][2];
extern int SCATTER_CORNERS[4][2];
extern int TABLES_INITIALIZED;

void init_game_tables(void);
int choose_next_ghost_dir(int cur_x, int cur_y, int cur_dir, int target_x, int target_y);

/**
 * Updates Blinky's target tile, determines the next movement direction,
 * and updates his position according to the 1980 Pac-Man arcade specification.
 */
void update_blinky_ai(GameState *state) {
    if (!TABLES_INITIALIZED) {
        init_game_tables();
    }

    int target_x;
    int target_y;

    /* Blinky targets Pac-Man directly in Chase mode (mode 0) */
    if (state->mode == 1) {
        /* Scatter mode: target fixed top-right corner (27, 0) */
        target_x = SCATTER_CORNERS[0][0];
        target_y = SCATTER_CORNERS[0][1];
    } else if (state->mode == 2) {
        /* Frightened / alternate mode: inverted Pac-Man coordinates */
        target_x = 27 - state->pacman_x;
        target_y = 35 - state->pacman_y;
    } else {
        /* Chase mode */
        target_x = state->pacman_x;
        target_y = state->pacman_y;
    }

    int cur_dir = state->blinky_dir;
    int cur_x = state->blinky_x;
    int cur_y = state->blinky_y;

    int next_dir = choose_next_ghost_dir(cur_x, cur_y, cur_dir, target_x, target_y);
    state->blinky_dir = next_dir;

    state->blinky_x = cur_x + DIR_OFFSETS[next_dir][0];
    state->blinky_y = cur_y + DIR_OFFSETS[next_dir][1];
}