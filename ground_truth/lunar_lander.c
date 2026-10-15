/**
 * Apollo 11 Lunar Module Guidance & Descent Physics Computer (1979)
 * Ground Truth C Implementation.
 *
 * Implements 6 interconnected guidance and flight dynamics subroutines:
 * - sub_00401020: init_flight_computer
 * - sub_00401080: generate_terrain_profile
 * - sub_00401140: apply_thrust_vector
 * - sub_00401200: update_newtonian_physics
 * - sub_00401280: check_altitude_raycast
 * - sub_00401320: evaluate_touchdown_dynamics
 */

#include "lunar_lander.h"
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* ============================================================================
 * Static Memory Tables (Target Memory Offsets in Stripped Binary)
 * ============================================================================ */

/* Virtual Address: 0x00403000 - Non-linear DPS Throttle Response Curve (0% to 100%) */
const double THRUST_THROTTLE_CURVE[THROTTLE_STEPS] = {
    0.00,  /* 0%   - Engine shutdown */
    0.10,  /* 10%  - Minimum continuous throttle (Apollo DPS limitation) */
    0.20,  /* 20%  - Low cruise */
    0.30,  /* 30%  - Descent deceleration */
    0.40,  /* 40%  - Approach trajectory */
    0.50,  /* 50%  - Hover trim */
    0.60,  /* 60%  - Terminal descent brake */
    0.72,  /* 70%  - Heavy braking step */
    0.82,  /* 80%  - High deceleration gate */
    0.91,  /* 90%  - Emergency abort ascent boost */
    1.00   /* 100% - Full rated 45 kN thrust */
};

/* Virtual Address: 0x00403080 - Lunar Gravitational Mascon Anomalies across 16 sectors */
const double LUNAR_GRAVITY_ANOMALY[ANOMALY_POINTS] = {
    0.000,  0.004,  0.009,  0.015,
    0.012,  0.005, -0.002, -0.008,
    -0.005, 0.000,  0.006,  0.011,
    0.008,  0.003, -0.001,  0.000
};

/* Virtual Address: 0x00403100 - Lunar Surface Elevation Profile (32 elevation points) */
double TERRAIN_SURFACE_PROFILE[TERRAIN_POINTS] = {0};

/* Virtual Address: 0x00403200 - Flight Telemetry and Dynamic State Register Block */
FlightTelemetry flight_telemetry = {0};

/* ============================================================================
 * Flight Subroutines
 * ============================================================================ */

/**
 * sub_00401020: init_flight_computer
 * Initializes the Apollo Guidance Computer state registers, mass budgets,
 * initial approach trajectory vectors, and populates the terrain profile.
 */
void init_flight_computer(void) {
    flight_telemetry.x = 250.0;             /* meters from site datum */
    flight_telemetry.y = 1000.0;            /* initial altitude (1 km descent gate) */
    flight_telemetry.vx = 4.0;              /* initial horizontal velocity (m/s) */
    flight_telemetry.vy = -12.0;            /* initial descent rate (-12 m/s) */
    flight_telemetry.pitch = 0.05;          /* slight forward attitude (+0.05 rad) */
    flight_telemetry.fuel_mass = INITIAL_FUEL_MASS; /* 8200 kg propellant */
    flight_telemetry.throttle = 0.0;        /* engines idling */
    flight_telemetry.total_mass = DRY_MASS + INITIAL_FUEL_MASS; /* 12,700 kg */
    flight_telemetry.is_landed = FLIGHT_IN_PROGRESS;
    flight_telemetry.status_code = 0;
    flight_telemetry.tick_count = 0;

    generate_terrain_profile();
}

/**
 * sub_00401080: generate_terrain_profile
 * Constructs the landing site topography into memory offset 0x00403100.
 * Synthesizes crater ridges with a designated flat touchdown zone (pad)
 * between sectors 11 and 19 (x approx 350m to 615m) at elevation 10.0m.
 */
void generate_terrain_profile(void) {
    for (int i = 0; i < TERRAIN_POINTS; i++) {
        if (i < 11) {
            /* West crater slope: 75m sloping down to 20m */
            TERRAIN_SURFACE_PROFILE[i] = 75.0 - ((double)i * 5.0);
        } else if (i >= 11 && i <= 19) {
            /* Mare Tranquillitatis Designated Landing Pad: perfectly flat at 10.0m */
            TERRAIN_SURFACE_PROFILE[i] = 10.0;
        } else {
            /* East crater ridge: slopes up from 20m to 85m */
            int ridge_step = i - 19;
            TERRAIN_SURFACE_PROFILE[i] = 10.0 + ((double)ridge_step * 6.25);
        }
    }
}

/**
 * sub_00401140: apply_thrust_vector
 * Translates throttle commands and attitude pitch adjustments.
 * Resolves non-linear thrust curve from 0x00403000 and calculates
 * propellant mass depletion according to the Tsiolkovsky equation.
 */
void apply_thrust_vector(double commanded_throttle, double commanded_pitch_rate) {
    if (flight_telemetry.is_landed != FLIGHT_IN_PROGRESS) {
        return;
    }

    /* Clamp throttle command */
    if (commanded_throttle < 0.0) commanded_throttle = 0.0;
    if (commanded_throttle > 1.0) commanded_throttle = 1.0;

    /* Update pitch angle (-PI/2 to PI/2) */
    flight_telemetry.pitch += commanded_pitch_rate * DT;
    if (flight_telemetry.pitch > (M_PI / 2.0)) flight_telemetry.pitch = M_PI / 2.0;
    if (flight_telemetry.pitch < (-M_PI / 2.0)) flight_telemetry.pitch = -M_PI / 2.0;

    /* Propellant mass check */
    if (flight_telemetry.fuel_mass <= 0.0) {
        flight_telemetry.fuel_mass = 0.0;
        flight_telemetry.throttle = 0.0;
        flight_telemetry.status_code = 999; /* FUEL_EXHAUSTION */
        flight_telemetry.total_mass = DRY_MASS;
        return;
    }

    flight_telemetry.throttle = commanded_throttle;

    /* Lookup effective thrust from table 0x00403000 */
    int step = (int)(commanded_throttle * 10.0);
    if (step > 10) step = 10;
    double thrust_coeff = THRUST_THROTTLE_CURVE[step];
    double actual_thrust = thrust_coeff * MAX_THRUST;

    /* Propellant burn rate dm = (T / v_e) * dt */
    double fuel_burned = (actual_thrust / EXHAUST_VELOCITY) * DT;
    if (fuel_burned > flight_telemetry.fuel_mass) {
        fuel_burned = flight_telemetry.fuel_mass;
        flight_telemetry.fuel_mass = 0.0;
        flight_telemetry.status_code = 999;
    } else {
        flight_telemetry.fuel_mass -= fuel_burned;
    }

    flight_telemetry.total_mass = DRY_MASS + flight_telemetry.fuel_mass;
}

/**
 * sub_00401200: update_newtonian_physics
 * Performs 2D Newtonian numerical vector integration for flight dynamics.
 * Couples thrust vectors, mascon gravity anomalies from 0x00403080,
 * velocity acceleration, and monitors terrain raycast contact.
 */
void update_newtonian_physics(void) {
    if (flight_telemetry.is_landed != FLIGHT_IN_PROGRESS) {
        return;
    }

    /* Lookup local gravity anomaly from 0x00403080 */
    double clamped_x = flight_telemetry.x;
    if (clamped_x < 0.0) clamped_x = 0.0;
    if (clamped_x > 999.0) clamped_x = 999.0;
    int sector = (int)(clamped_x / (1000.0 / (double)ANOMALY_POINTS));
    if (sector >= ANOMALY_POINTS) sector = ANOMALY_POINTS - 1;

    double local_g = LUNAR_GRAVITY + LUNAR_GRAVITY_ANOMALY[sector];

    /* Effective thrust from throttle lookup */
    int step = (int)(flight_telemetry.throttle * 10.0);
    if (step > 10) step = 10;
    double thrust = THRUST_THROTTLE_CURVE[step] * MAX_THRUST;

    /* Newtonian vector forces */
    /* pitch = 0 is vertical upwards; sin(pitch) gives horizontal thrust component */
    double Fx = thrust * sin(flight_telemetry.pitch);
    double Fy = (thrust * cos(flight_telemetry.pitch)) - (flight_telemetry.total_mass * local_g);

    /* Accelerations */
    double ax = Fx / flight_telemetry.total_mass;
    double ay = Fy / flight_telemetry.total_mass;

    /* Euler-Cromer integration for energy conservation */
    flight_telemetry.vx += ax * DT;
    flight_telemetry.vy += ay * DT;
    flight_telemetry.x += flight_telemetry.vx * DT;
    flight_telemetry.y += flight_telemetry.vy * DT;

    flight_telemetry.tick_count++;

    /* Terrain collision detection */
    double radar_alt = check_altitude_raycast();
    if (radar_alt <= 0.0) {
        /* Vehicle contact with lunar surface */
        evaluate_touchdown_dynamics();
    }
}

/**
 * sub_00401280: check_altitude_raycast
 * Raycasts down to the terrain polygon at current horizontal coordinate x.
 * Computes radar altitude above ground: h = y_lander - y_terrain.
 */
double check_altitude_raycast(void) {
    double x = flight_telemetry.x;
    double dx_segment = 1000.0 / (double)(TERRAIN_POINTS - 1);

    if (x <= 0.0) {
        return flight_telemetry.y - TERRAIN_SURFACE_PROFILE[0];
    }
    if (x >= 1000.0) {
        return flight_telemetry.y - TERRAIN_SURFACE_PROFILE[TERRAIN_POINTS - 1];
    }

    int seg_idx = (int)(x / dx_segment);
    if (seg_idx >= TERRAIN_POINTS - 1) seg_idx = TERRAIN_POINTS - 2;

    double x_local = x - ((double)seg_idx * dx_segment);
    double t = x_local / dx_segment;

    /* Linear interpolation between terrain altitude markers */
    double y_terrain = ((1.0 - t) * TERRAIN_SURFACE_PROFILE[seg_idx]) + (t * TERRAIN_SURFACE_PROFILE[seg_idx + 1]);

    return flight_telemetry.y - y_terrain;
}

/**
 * sub_00401320: evaluate_touchdown_dynamics
 * Evaluates structural stress and kinematic velocity thresholds upon
 * surface contact. Enforces strict Apollo descent touchdown criteria.
 */
int evaluate_touchdown_dynamics(void) {
    double abs_vy = fabs(flight_telemetry.vy);
    double abs_vx = fabs(flight_telemetry.vx);
    double abs_pitch = fabs(flight_telemetry.pitch);

    /* Check vertical velocity limit */
    if (abs_vy > MAX_TOUCHDOWN_VY) {
        flight_telemetry.is_landed = CRASH_EXCESS_DESCENT_RATE;
        return CRASH_EXCESS_DESCENT_RATE;
    }

    /* Check lateral shear velocity limit */
    if (abs_vx > MAX_TOUCHDOWN_VX) {
        flight_telemetry.is_landed = CRASH_LATERAL_SHEAR;
        return CRASH_LATERAL_SHEAR;
    }

    /* Check attitude tilt limit */
    if (abs_pitch > MAX_TOUCHDOWN_TILT) {
        flight_telemetry.is_landed = CRASH_EXCESS_TILT;
        return CRASH_EXCESS_TILT;
    }

    /* Check terrain slope at touchdown site */
    double dx_segment = 1000.0 / (double)(TERRAIN_POINTS - 1);
    int seg_idx = (int)(flight_telemetry.x / dx_segment);
    if (seg_idx < 0) seg_idx = 0;
    if (seg_idx >= TERRAIN_POINTS - 1) seg_idx = TERRAIN_POINTS - 2;

    double slope = fabs(TERRAIN_SURFACE_PROFILE[seg_idx + 1] - TERRAIN_SURFACE_PROFILE[seg_idx]) / dx_segment;
    if (slope > 0.08) { /* Exceeds 4.5 degree incline limit */
        flight_telemetry.is_landed = CRASH_ROUGH_TERRAIN;
        return CRASH_ROUGH_TERRAIN;
    }

    /* Successful Apollo touchdown */
    flight_telemetry.is_landed = TOUCHDOWN_SUCCESS;
    flight_telemetry.vx = 0.0;
    flight_telemetry.vy = 0.0;
    flight_telemetry.throttle = 0.0;
    return TOUCHDOWN_SUCCESS;
}
