// jsacmi.js - JavaScript module for loading, saving, and managing Tacview ACMI files.
(function(exports) {

    // -- Internal helper functions
    function lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }

    // -- Classes (exported)
    class TrackObject {
    
        constructor(id, data) {
            this.id = id;
            this.data = data;
        }

        findNearestValueIndex(comp, index, delta) {

            // Initialize at the current position
            var currEntry = this.data.vals[index];

            // Keep stepping back until we find it
            while (comp(currEntry) == false) {
                index += delta;
                if (index < 0 || index >= this.data.vals.length) return -1;
                currEntry = this.data.vals[index];
            }
        
            // We found it, so return the index
            return index;
        }

        findNearestValue(comp, index, delta) {
            var ndx = this.findNearestValueIndex(comp, index, delta);
            if (ndx === -1) return null;
            return this.data.vals[ndx];
        }

        findFirstValue(comp) {
            return this.findNearestValue(comp, 0, 1);
        }

        findLastValue(comp) {
            return this.findNearestValue(comp, this.data.vals.length - 1, -1);
        }

        binTimeSearch(time, ndx1, ndx2) {
        
            // Retrieve the middle two values
            var mid = Math.floor((ndx1 + ndx2) / 2);
            var t1 = this.data.vals[mid]['_time'];
            var t2 = this.data.vals[mid + 1]['_time'];

            // Base case: our value is in between
            if (time >= t1 && time <= t2) return mid;

            // Recursive case: we go left or right
            if (time < t1) return this.binTimeSearch(time, ndx1, mid);
            else return this.binTimeSearch(time, mid + 1, ndx2);
        }

        findTimeIndex(time) {

            // Sanity check
            if (time <= this.data.vals[0]['_time']) return 0;
            if (time >= this.data.vals[this.data.vals.length - 1]['_time']) return this.data.vals.length - 1;
        
            // Binary search
            return this.binTimeSearch(time, 0, this.data.vals.length - 1);
        }
 
        findValueAtTime(comp, retrieve, time) {
       
            // First look up the time index
            var startIndex = this.findTimeIndex(time);

            // Sanity check: before and after the time limits?
            if (startIndex <= 0) return retrieve(this.findFirstValue(comp));
            if (startIndex >= this.data.vals.length - 1) return retrieve(this.findLastValue(comp));

            // Now we need to search for the value before and after this index
            var prevIndex = this.findNearestValueIndex(comp, startIndex, -1);
            var nextIndex = this.findNearestValueIndex(comp, startIndex + 1, 1);

            // FIXME: Handle edge cases (index = -1)

            // Calculate the time difference and interpolate
            var prevTime = this.data.vals[prevIndex]['_time']; 
            var nextTime = this.data.vals[nextIndex]['_time'];
            var timeDelta = nextTime - prevTime;
            var prevValue = retrieve(this.data.vals[prevIndex]);
            var nextValue = retrieve(this.data.vals[nextIndex]);
            return lerp(prevValue, nextValue, (time - prevTime) / timeDelta);
        }

        getValueAtTime(name, time) {
            return this.findValueAtTime((e) => name in e, (e) => e[name], time);
        }
   
        getStringAtTime(name, time) {

            // First look up the time index
            var startIndex = this.findTimeIndex(time);

            // Sanity check: before and after the time limits?
            if (startIndex <= 0) return this.findFirstValue((e) => name in e)[name];
            if (startIndex >= this.data.vals.length - 1) return this.findLastValue((x) => name in x)[name];

            // Let's find the closest value (earlier in time)
            return this.findNearestValue((x) => name in x, startIndex, -1)[name];
        }

        getCoordAtTime(coord, time) {
            return this.findValueAtTime((e) => 'T' in e && e['T'].length > coord && e['T'][coord] != null, (e) => e['T'][coord], time);
        }
    
        static createObject(time) {
            return { start: time, end: null, vals: [] };
        }

        static createEntry(time) {
            return { "_time": parseFloat(time) };
        }

        static addEntry(data, entry) {
            data.vals.push(entry);
        }
    }

     class TrackDatabase {

        constructor(data = null) {
            this.data = data != null ? data : {};
            if (0 in this.data) {
                this.global = this.data[0];
            }
            else {
                this.global = TrackObject.createObject(0.0);
                this.data[0] = this.global;
            }
        }

        get objects() {
            var objs = [];
            for (const [id, data] of Object.entries(this.data)) {
                objs.push(new TrackObject(id, data));
            }
        }

    }

    // EXPORTS
    exports.TrackDatabase = TrackDatabase;
    exports.TrackObject = TrackObject;

})(typeof exports === 'undefined'? this['jsacmi']={}: exports);
