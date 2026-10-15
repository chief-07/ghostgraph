/* Candidate: update_blinky_ai (GhostGraph FalkorDB Mode) */
#include <stdio.h>
#include <math.h>

/* Restored from FalkorDB Memory Address DAT_00406080 */
static const int DIR_OFFSETS[4][2] = {{0, -1}, {-1, 0}, {0, 1}, {1, 0}};
/* Restored from FalkorDB Memory Address DAT_004060C0 */
static const int SCATTER_CORNERS[4][2] = {{27, 0}, {0, 0}, {27, 35}, {0, 35}};

int check_wall_collision(int x, int y);
double euclidean_distance_sq(int x1, int y1, int x2, int y2);
int choose_next_ghost_dir(int cur_x, int cur_y, int cur_dir, int target_x, int target_y);

void update_blinky_ai(void *state_ptr) {
    int *s = (int *)state_ptr;
    int target_x = s[0]; // pacman_x
    int target_y = s[1]; // pacman_y
    int mode = s[15];    // mode

    if (mode == 1) {
        target_x = SCATTER_CORNERS[0][0];
        target_y = SCATTER_CORNERS[0][1];
    }

    int cur_dir = s[5];
    int next_dir = choose_next_ghost_dir(s[3], s[4], cur_dir, target_x, target_y);
    s[5] = next_dir;
    s[3] += DIR_OFFSETS[next_dir][0];
    s[4] += DIR_OFFSETS[next_dir][1];
}
