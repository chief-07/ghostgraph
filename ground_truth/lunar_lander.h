/**
 * Apollo 11 Lunar Module Guidance & Descent Physics Computer (1979)
 * Ground Truth Embedded Flight Subsystem Specification.
 *
 * Real Newtonian 2D vector dynamics, Tsiolkovsky fuel depletion,
 * mascon gravity anomalies, terrain raycasting, and touchdown dynamics.
 */

#ifndef LUNAR_LANDER_H
#define LUNAR_LANDER_H

#include <stdint.h>
#include <stdbool.h>

#define LUNAR_GRAVITY 1.62          // m/s^2 standard lunar gravity
#define DRY_MASS 4500.0             // kg (LEM ascent/descent dry structure)
#define INITIAL_FUEL_MASS 8200.0    // kg (Descent Propulsion System propellant)
#define MAX_THRUST 45000.0          // Newtons (Apollo DPS 45 kN engine)
#define ISP 311.0                   // seconds (Aerozine 50 / N2O4 specific impulse)
#define STANDARD_G 9.80665          // m/s^2 for exhaust velocity calculation
#define EXHAUST_VELOCITY (ISP * STANDARD_G) // ~3049.868 m/s
#define DT 0.1                      // seconds per simulation step (10 Hz clock)

#define MAX_TOUCHDOWN_VY 3.0        // m/s max allowable vertical descent speed
#define MAX_TOUCHDOWN_VX 1.5        // m/s max allowable horizontal drift speed
#define MAX_TOUCHDOWN_TILT 0.10     // radians (~5.7 degrees) max allowable tilt angle

#define TERRAIN_POINTS 32
#define ANOMALY_POINTS 16
#define THROTTLE_STEPS 11

typedef enum {
    FLIGHT_IN_PROGRESS = 0,
    TOUCHDOWN_SUCCESS = 1,
    CRASH_EXCESS_DESCENT_RATE = -1,
    CRASH_LATERAL_SHEAR = -2,
    CRASH_EXCESS_TILT = -3,
    CRASH_ROUGH_TERRAIN = -4
} TouchdownStatus;

typedef struct {
    double x;               // horizontal coordinate (meters)
    double y;               // altitude above lunar datum (meters)
    double vx;              // horizontal velocity (m/s)
    double vy;              // vertical velocity (m/s)
    double pitch;           // attitude angle in radians (0 is upright vertical, + is right tilt)
    double fuel_mass;       // remaining propellant (kg)
    double throttle;        // commanded engine throttle (0.0 to 1.0)
    double total_mass;      // total vehicle mass: DRY_MASS + fuel_mass (kg)
    int is_landed;          // TouchdownStatus: 0=flying, 1=safe, <0=crash
    int status_code;        // 0=NOMINAL, 999=FUEL_EXHAUSTION, 1201=EXCESS_ATTITUDE_RATE
    uint32_t tick_count;    // simulation tick counter
} FlightTelemetry;

/* Static Memory Tables (detached to 0x00403000 series in stripped binary) */
/* 0x00403000: Throttle to effective thrust factor lookup table */
extern const double THRUST_THROTTLE_CURVE[THROTTLE_STEPS];

/* 0x00403080: Mascon local gravity anomaly variations (m/s^2) */
extern const double LUNAR_GRAVITY_ANOMALY[ANOMALY_POINTS];

/* 0x00403100: Lunar surface elevation profile points */
extern double TERRAIN_SURFACE_PROFILE[TERRAIN_POINTS];

/* 0x00403200: Global telemetry state block */
extern FlightTelemetry flight_telemetry;

/* Subroutine Prototypes */
void init_flight_computer(void);
void generate_terrain_profile(void);
void apply_thrust_vector(double commanded_throttle, double commanded_pitch_rate);
void update_newtonian_physics(void);
double check_altitude_raycast(void);
int evaluate_touchdown_dynamics(void);

#endif /* LUNAR_LANDER_H */
