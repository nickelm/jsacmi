const jsacmi = require('./jsacmi');
const trackio = require('./trackio');

module.exports = {
    TrackObject: jsacmi.TrackObject,
    TrackDatabase: jsacmi.TrackDatabase,
    TrackIO: trackio,
    C_LON: 0,   // Longitude coordinate index
    C_LAT: 1,   // Latitude coordinate index
    C_ALT: 2,   // Altitude (meters) coordinate index   
    C_ROLL: 3,  // Roll (positive to the right) coordinate index
    C_PITCH: 4, // Pitch (positive when taking off) coordinate index
    C_YAW: 5,   // Yaw (clockwise relative to true north) coordinate index
    C5_U: 3,    // Native X (meters) coordinate index (5-tuple)
    C5_V: 4,    // Native Y (meters) coordinate index (5-tuple)
    C9_U: 6,    // Native X (meters) coordinate index (9-tuple)
    C9_U: 7,    // Native Y (meters) coordinate index (9-tuple)
    C_HDG: 8    // Heading (clockwise relative to true north) coordinate index (9-tuple)
};