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

/* Direction vectors: 0: UP (0, -1), 1: LEFT (-1, 0), 2: DOWN (0, 1), 3: RIGHT (1, 0) */
extern int DIR_OFFSETS[4][2];
extern int SCATTER_CORNERS[4][2];
extern int tables_initialized;

void init_game_tables(void);
int choose_next_ghost_dir(int cur_x, int cur_y, int cur_dir, int target_x, int target_y);

/**
 * Updates Blinky's target tile, direction, and position according to current game mode.
 * 
 * Mode 0 (Chase): Targets Pac-Man's current tile directly.
 * Mode 1 (Scatter): Targets top-right corner (27, 0).
 * Mode 2 (Frightened): Targets mirrored position (27 - x, 35 - y).
 */
void update_blinky_ai(GameState *game) {
    if (!tables_initialized) {
        init_game_tables();
    }

    int target_x = game->pacman_x;
    int target_y = game->pacman_y;

    if (game->mode == 1) {
        /* Blinky's scatter target (corner index 0) */
        target_x = SCATTER_CORNERS[0][0];
        target_y = SCATTER_CORNERS[0][1];
    } else if (game->mode == 2) {
        target_x = 27 - game->pacman_x;
        target_y = 35 - game->pacman_y;
    }

    int cur_dir = game->blinky_dir;
    int cur_x = game->blinky_x;
    int cur_y = game->blinky_y;

    int next_dir = choose_next_ghost_dir(cur_x, cur_y, cur_dir, target_x, target_y);

    game->blinky_dir = next_dir;
    game->blinky_x = cur_x + DIR_OFFSETS[next_dir][0];
    game->blinky_y = cur_y + DIR_OFFSETS[next_dir][1];
}