/**
 * Ground Truth: Retro Snake Engine (1980s Nibbles / Arcade Classic)
 * Complete, self-contained ANSI C game engine with deterministic state machine,
 * static ring buffer coordinate tables, direction vector matrices, and collision physics.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>

#define GRID_WIDTH 20
#define GRID_HEIGHT 20
#define MAX_SNAKE_LEN 64

typedef enum {
    DIR_UP = 0,
    DIR_RIGHT = 1,
    DIR_DOWN = 2,
    DIR_LEFT = 3
} Direction;

typedef struct {
    int score;
    int length;
    int food_x;
    int food_y;
    int is_alive;
    int tick_count;
    Direction current_dir;
} SnakeGameState;

/* Static Memory Tables (Stripped Pointers in Decompiled Binaries) */
/* Virtual Address: 0x00404000 - Body X Coordinate Ring Buffer */
int snake_body_x[MAX_SNAKE_LEN] = {0};

/* Virtual Address: 0x00404080 - Body Y Coordinate Ring Buffer */
int snake_body_y[MAX_SNAKE_LEN] = {0};

/* Virtual Address: 0x00404100 - 2D Direction Delta Table [dx, dy] */
const int DIR_DELTAS[4][2] = {
    { 0, -1 },  /* UP */
    { 1,  0 },  /* RIGHT */
    { 0,  1 },  /* DOWN */
    {-1,  0 }   /* LEFT */
};

/* Virtual Address: 0x00404120 - Game Header State Block */
SnakeGameState snake_game = {0};

/* Function Prototypes */
void init_snake_game(void);
void spawn_snake_food(void);
int set_snake_direction(int new_dir);
int step_snake_tick(void);
int check_snake_food(void);
int check_snake_collision(int next_x, int next_y);
void get_snake_render_frame(char *buffer, int buf_size);

/**
 * sub_00401050: init_snake_game
 * Initializes the game state, positions the snake at center (10, 10),
 * seeds 3 initial segments moving right, and spawns the first food.
 */
void init_snake_game(void) {
    snake_game.score = 0;
    snake_game.length = 3;
    snake_game.is_alive = 1;
    snake_game.tick_count = 0;
    snake_game.current_dir = DIR_RIGHT;

    // Head at (10, 10), body trailing left
    snake_body_x[0] = 10; snake_body_y[0] = 10;
    snake_body_x[1] = 9;  snake_body_y[1] = 10;
    snake_body_x[2] = 8;  snake_body_y[2] = 10;

    for (int i = 3; i < MAX_SNAKE_LEN; i++) {
        snake_body_x[i] = -1;
        snake_body_y[i] = -1;
    }

    // Initial deterministic food placement
    snake_game.food_x = 15;
    snake_game.food_y = 10;
}

/**
 * sub_00401120: spawn_snake_food
 * Generates pseudo-random coordinates for food, ensuring it does not
 * intersect any existing body segment.
 */
void spawn_snake_food(void) {
    int attempts = 0;
    while (attempts < 100) {
        int fx = (snake_game.tick_count * 7 + 13) % GRID_WIDTH;
        int fy = (snake_game.tick_count * 11 + 5) % GRID_HEIGHT;

        int collides = 0;
        for (int i = 0; i < snake_game.length; i++) {
            if (snake_body_x[i] == fx && snake_body_y[i] == fy) {
                collides = 1;
                break;
            }
        }

        if (!collides) {
            snake_game.food_x = fx;
            snake_game.food_y = fy;
            return;
        }
        snake_game.tick_count++;
        attempts++;
    }
    snake_game.food_x = 5;
    snake_game.food_y = 5;
}

/**
 * sub_00401200: set_snake_direction
 * Validates 180-degree lock: prevents snake from reversing directly into itself.
 */
int set_snake_direction(int new_dir) {
    if (new_dir < 0 || new_dir > 3) return 0;
    // Cannot reverse 180 degrees (e.g. UP <-> DOWN, LEFT <-> RIGHT)
    if ((new_dir == DIR_UP && snake_game.current_dir == DIR_DOWN) ||
        (new_dir == DIR_DOWN && snake_game.current_dir == DIR_UP) ||
        (new_dir == DIR_LEFT && snake_game.current_dir == DIR_RIGHT) ||
        (new_dir == DIR_RIGHT && snake_game.current_dir == DIR_LEFT)) {
        return 0; // Rejected turn
    }
    snake_game.current_dir = (Direction)new_dir;
    return 1;
}

/**
 * sub_004012A0: check_snake_collision
 * Checks if coordinate (next_x, next_y) hits outer walls or snake body.
 */
int check_snake_collision(int next_x, int next_y) {
    // Wall collision (20x20 grid, 0..19)
    if (next_x < 0 || next_x >= GRID_WIDTH || next_y < 0 || next_y >= GRID_HEIGHT) {
        return 1; // Wall hit
    }
    // Self-intersection collision (skip tail tip because it will move)
    for (int i = 0; i < snake_game.length - 1; i++) {
        if (snake_body_x[i] == next_x && snake_body_y[i] == next_y) {
            return 2; // Body hit
        }
    }
    return 0; // Clean space
}

/**
 * sub_00401340: check_snake_food
 * Checks if the head has reached the food. If so, increases score and grows snake.
 */
int check_snake_food(void) {
    if (snake_body_x[0] == snake_game.food_x && snake_body_y[0] == snake_game.food_y) {
        snake_game.score += 10;
        if (snake_game.length < MAX_SNAKE_LEN) {
            // Tail segment stays in place to grow body
            snake_body_x[snake_game.length] = snake_body_x[snake_game.length - 1];
            snake_body_y[snake_game.length] = snake_body_y[snake_game.length - 1];
            snake_game.length++;
        }
        spawn_snake_food();
        return 1;
    }
    return 0;
}

/**
 * sub_00401400: update_snake_physics
 * Steps the physics simulation by 1 frame.
 * Shifts coordinate ring buffer, calculates next head position via DIR_DELTAS,
 * checks collisions, and updates food.
 */
int step_snake_tick(void) {
    if (!snake_game.is_alive) return 0;
    snake_game.tick_count++;

    // Calculate prospective next head position using direction vectors
    int dx = DIR_DELTAS[snake_game.current_dir][0];
    int dy = DIR_DELTAS[snake_game.current_dir][1];
    int next_x = snake_body_x[0] + dx;
    int next_y = snake_body_y[0] + dy;

    // Check collision
    int col = check_snake_collision(next_x, next_y);
    if (col != 0) {
        snake_game.is_alive = 0;
        return 0; // Game over
    }

    // Shift body segments backwards through ring buffer
    for (int i = snake_game.length - 1; i > 0; i--) {
        snake_body_x[i] = snake_body_x[i - 1];
        snake_body_y[i] = snake_body_y[i - 1];
    }

    // Set new head position
    snake_body_x[0] = next_x;
    snake_body_y[0] = next_y;

    // Check food consumption
    check_snake_food();

    return 1;
}

/**
 * sub_00401520: get_snake_render_frame
 * Serializes the game board into a compact JSON string for web canvas rendering.
 */
void get_snake_render_frame(char *buffer, int buf_size) {
    char body_json[1024] = "[";
    for (int i = 0; i < snake_game.length; i++) {
        char seg[32];
        snprintf(seg, sizeof(seg), "{\"x\":%d,\"y\":%d}%s", 
                 snake_body_x[i], snake_body_y[i], 
                 (i == snake_game.length - 1) ? "" : ",");
        strncat(body_json, seg, sizeof(body_json) - strlen(body_json) - 1);
    }
    strncat(body_json, "]", sizeof(body_json) - strlen(body_json) - 1);

    snprintf(buffer, buf_size, 
             "{\"score\":%d,\"length\":%d,\"alive\":%d,\"food\":{\"x\":%d,\"y\":%d},\"dir\":%d,\"body\":%s}",
             snake_game.score, snake_game.length, snake_game.is_alive, 
             snake_game.food_x, snake_game.food_y, snake_game.current_dir, body_json);
}

#ifdef STANDALONE_MAIN
int main(void) {
    init_snake_game();
    printf("Snake Engine Initialized. Length: %d, Head: (%d, %d)\n", 
           snake_game.length, snake_body_x[0], snake_body_y[0]);
    for (int t = 0; t < 10; t++) {
        step_snake_tick();
        printf("Tick %d: Head at (%d, %d), Score: %d\n", 
               t, snake_body_x[0], snake_body_y[0], snake_game.score);
    }
    return 0;
}
#endif
