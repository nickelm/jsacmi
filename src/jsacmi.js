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
            this.extractSingletons();
        }

        findNearestValueIndex(comp, index, delta) {

            // Initialize at the current position
            let currEntry = this.data.vals[index];

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
            let mid = Math.floor((ndx1 + ndx2) / 2);
            let t1 = this.data.vals[mid]['#'];
            let t2 = this.data.vals[mid + 1]['#'];

            // Base case: our value is in between
            if (time >= t1 && time <= t2) return mid;

            // Recursive case: we go left or right
            if (time < t1) return this.binTimeSearch(time, ndx1, mid);
            else return this.binTimeSearch(time, mid + 1, ndx2);
        }

        findTimeIndex(time) {

            // Sanity check
            if (time <= this.data.vals[0]['#']) return 0;
            if (time >= this.data.vals[this.data.vals.length - 1]['#']) return this.data.vals.length - 1;
        
            // Binary search
            return this.binTimeSearch(time, 0, this.data.vals.length - 1);
        }
        
        getFirstTime() {
            console.log('' + this.data.vals[0]['#']);
            return this.data.vals[0]['#'];
        }

        getLastTime() {
            return this.data.vals[this.data.vals.length - 1]['#'];
        }
 
        findNumberAtTime(comp, retrieve, time) {
       
            // First look up the time index
            let startIndex = this.findTimeIndex(time);

            // Sanity check: before and after the time limits?
            if (startIndex <= 0) return retrieve(this.findFirstValue(comp));
            if (startIndex >= this.data.vals.length - 1) return retrieve(this.findLastValue(comp));

            // Now we need to search for the value before and after this index
            let prevIndex = this.findNearestValueIndex(comp, startIndex, -1);
            let nextIndex = this.findNearestValueIndex(comp, startIndex + 1, 1);

            // Handle edge cases (index = -1; shouldn't happen)
            if (prevIndex === -1 || nextIndex === -1) return 0.0;

            // Calculate the time difference and interpolate
            let prevTime = this.data.vals[prevIndex]['#']; 
            let nextTime = this.data.vals[nextIndex]['#'];
            let timeDelta = nextTime - prevTime;
            let prevValue = retrieve(this.data.vals[prevIndex]);
            let nextValue = retrieve(this.data.vals[nextIndex]);
            return lerp(prevValue, nextValue, (time - prevTime) / timeDelta);
        }

        getFirstValue(name) {
            return this.findFirstValue((e) => name in e)[name];
        }

        getLastValue(name) {
            return this.findLastValue((e) => name in e)[name];
        }

        getNumberAtTime(name, time) {
            return this.findNumberAtTime((e) => name in e, (e) => e[name], time);
        }
   
        getValueAtTime(name, time) {

            // First look up the time index
            let startIndex = this.findTimeIndex(time);

            // Sanity check: before and after the time limits?
            if (startIndex <= 0) return this.findFirstValue((e) => name in e)[name];
            if (startIndex >= this.data.vals.length - 1) return this.findLastValue((x) => name in x)[name];

            // Let's find the closest value (earlier in time)
            return this.findNearestValue((x) => name in x, startIndex, -1)[name];
        }

        getCoordAtTime(coord, time) {
            return this.findNumberAtTime((e) => 'T' in e && e['T'].length > coord && e['T'][coord] != null, (e) => e['T'][coord], time);
        }
    
        static createObject(time) {
            return { start: time, end: null, vals: [] };
        }

        static createEntry(time) {
            return { "#": parseFloat(time) };
        }

        static addEntry(data, entry) {
            data.vals.push(entry);
        }

        extractSingletons() {

            // Sanity check
            if (this.data == null) return;

            // Step through all of the entries
            let registry = {};
            for (let i = 0; i < this.data.vals.length; i++) {
                let entry = this.data.vals[i];
                for (let elem in entry) {
                    // FIXME: Could make this more efficient
                    if (registry.hasOwnProperty(elem) == false) {
                        registry[elem] = [];
                    }
                    registry[elem].push(i);
                }
            }

            // Now extract those who only appear once
            for (let val in registry) {
                if (registry[val].length == 1) {
                    if (this.hasOwnProperty(val)) this["_" + val] = this.data.vals[registry[val][0]][val];
                    else this[val] = this.data.vals[registry[val][0]][val];
                }
            }
        }
    }

     class TrackDatabase {

        constructor(data = null) {
            this.data = data != null ? data : {};
            if (0 in this.data) {
                this.global = new TrackObject(0, this.data[0]);
            }
            else {
                this.global = TrackObject.createObject(0.0);
                this.data[0] = this.global;
            }
        }

        get objects() {
            let objs = [];
            for (const [id, data] of Object.entries(this.data)) {
                objs.push(new TrackObject(id, data));
            }
            return objs;
        }
    }

    // EXPORTS
    exports.TrackDatabase = TrackDatabase;
    exports.TrackObject = TrackObject;

})(typeof exports === 'undefined'? this['jsacmi']={}: exports);
