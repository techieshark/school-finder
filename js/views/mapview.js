var app, cartodb, Handlebars, L;
app = app || {};

(function () {

  var MapView = function () {
    this.$el = $('#map-container');
    this.template = Handlebars.compile($("#map-template").html());
  };

  app.MapView = MapView;

  MapView.filters = {
    distance: "(s.distance_education IN ('null') OR distance_education IS NULL)",
    boys: "s.gender = 'boys'",
    girls: "s.gender = 'girls'",
    oshc: "s.oshc = true",
    difficult: "(s.opportunity_class = true OR s.selective_school IN ('Partially Selective', 'Fully Selective'))",
    specialty: "school_specialty_type NOT IN ('Comprehensive')",
  };

  MapView.prototype.update = function (schools) {
    this.schools = schools;
    this.render();
  };

  MapView.prototype.render = function () {

    if (!this.schools) { return; } /* must update() w/ school list before rendering */

    var context = {};
    var html = this.template(context);

    // clean up any previous result & re-add
    this.$el.empty();
    this.$el.append(html);

    this.init();
  };


  MapView.onMouseOverOut = function (e) {
    var marker = e.target;
    if (e.type === 'mouseover') {
      marker.openPopup();
    } else if (e.type === 'mouseout') {
      if (!this.selectedMarker || marker !== this.selectedMarker) {
        // only auto close on mouse out if the marker hasn't been specifically selected (clicked)
        marker.closePopup();
      }
    }
  };

  // Let a user move the home marker to re-search at that location
  MapView.onMarkerDragEnd = function (event) {
    var marker = event.target;
    marker.closePopup();
    app.config.showHomeHelpPopup = false; // keep hidden from now on.
    var ll = marker.getLatLng();
    console.log(ll);
    app.lat = ll.lat;
    app.lng = ll.lng;
    // reverse geocode to grab the selected address, then get results.
    app.reverseGeocode(app.findByLocation);
  };


  MapView.prototype.clickSchool = function (row) {
    var that = this;
    return function (e) {
      // open the school name popup
      var marker = e.target;
      marker.openPopup();
      that.selectedMarker = marker;

      // tell the school view to show this particular school
      app.schoolView.update(new app.School(row));
    };
  };

  // Fetch nearby schools and add them to the map for context
  MapView.prototype.loadNearby = function () {
    var that = this;
    var school = this.schools.selected();

    // get current view's bounding box
    var mapBounds = this.map.getBounds();

    // query for nearby schools
    // http://postgis.refractions.net/docs/ST_MakeEnvelope.html ST_MakeEnvelope(left, bottom, right, top, [srid]) SRID defaults to 4326
    var bounds = {
      left: mapBounds.getWest(),
      bottom: mapBounds.getSouth(),
      right: mapBounds.getEast(),
      top: mapBounds.getNorth()
    };

    var q = new app.Query();
    // If app.level is unspecified (when someone just first searched for a school by name),
    // then for now just show schools of that type (instead of all schools).
    // Later we may want to let users control which markers are visible (TODO)
    // Include SSP here in case people are looking for that (later we can add a filtering step)
    q.setSchoolType([app.level || school.type, 'ssp'])
      .where("s.school_code NOT IN (" +  _.pluck(this.schools.schools, 'school_code') + ")")
      .byBounds(bounds);
    if (this.whereFilter) { // add custom filter if it has been set
      q.where(this.whereFilter);
    }
    q.run(function (data) {
      // add schools (except this one, already added) to map
      console.log(data);
      var markers = [];
      data.rows.forEach(function (row) {
        var marker = L.marker([row.latitude, row.longitude], {icon: app.geo.nearbyIcon})
          // note we're using a bigger offset on the popup to reduce flickering;
          // since we hide the popup on mouseout, if the popup is too close to the marker,
          // then the popup can actually sit on top of the marker and 'steals' the mouse as the cursor
          // moves near the edge between the marker and popup, making the popup flicker on and off.
          .bindPopup("<b>" + row.school_name + "</b>", {offset: [0, -28]})
          .on('click', that.clickSchool(row))
          .on('mouseover', MapView.onMouseOverOut, that)
          .on('mouseout', MapView.onMouseOverOut, that);
        markers.push(marker);
      });
      if (that.nearbyMarkersGroup) {
        that.map.removeLayer(that.nearbyMarkersGroup);
      }
      that.nearbyMarkersGroup = new L.featureGroup(markers);
      that.map.addLayer(that.nearbyMarkersGroup);

    });
  };

  MapView.prototype.init = function () {

    var school = this.schools.selected();

    // school level may be unspecified (if just searching by school name)
    // allow for that
    var levelFilter = '';
    if (app.level) {
      levelFilter = "school_type ~* '" + app.level + "' AND ";
    }

    var catchmentsSQL = "SELECT * FROM " + app.db.polygons + " " +
                 "WHERE " + levelFilter + "school_code = '" + school.school_code + "'";

    this.catchmentsSQL = catchmentsSQL;

    // center on either user's location or selected school
    var center = null;
    if (app.lat && app.lng) {
      center = [app.lat, app.lng];
    } else if (school.latitude && school.longitude) {
      center = [school.latitude, school.longitude];
    }

    // initiate leaflet map
    var mapEl = this.$el.find(":first")[0];
    var map = new L.Map(mapEl, {
      center: center,
      zoom: 12,
      scrollWheelZoom: false,
    });
    this.map = map;
    var that = this;

    map.on('viewreset moveend', function () {
      that.loadNearby();
    });

    L.tileLayer(app.geo.tiles, { attribution: app.geo.attribution }).addTo(map);

    // add result set to map
    this.schools.schools.forEach(function (resultSchool) {
      var icon;
      if (resultSchool === school) { // a result that's also the currently selected school
        icon = app.geo.pickedIcon;
      } else {
        icon = app.geo.resultIcon;
      }
      L.marker([resultSchool.latitude, resultSchool.longitude], {icon: icon})
        .addTo(map)
        // note we're using a bigger offset on the popup to reduce flickering;
        // since we hide the popup on mouseout, if the popup is too close to the marker,
        // then the popup can actually sit on top of the marker and 'steals' the mouse as the cursor
        // moves near the edge between the marker and popup, making the popup flicker on and off.
        .bindPopup("<b>" + resultSchool.school_name + "</b>", {offset: [0, -28]})
        .on('mouseover', app.MapView.onMouseOverOut)
        .on('mouseout', app.MapView.onMouseOverOut);
    });



    cartodb.createLayer(map, {
      user_name: app.db.user,
      https: true,
      tiler_protocol: 'https',
      tiler_port: '443',
      sql_port: "443",
      sql_protocol: "https",
      type: 'cartodb',
      sublayers:
        [
          { // background layer; all but selected polygon, for context
            sql: "SELECT * FROM " + app.db.polygons + " WHERE school_type ~* '" + app.level + "' AND school_code != '" + school.school_code + "'",
            cartocss: "#" + app.db.polygons + app.geo.backgroundCSS,
          },
          { // selected boundary
            sql: this.catchmentsSQL,
            cartocss: "#" + app.db.polygons + app.geo.catchmentCSS,
          },
        ]
    }).addTo(map)
      .done(function (layer) {
        that.layer = layer;
        that.layers = {};
        that.layers.catchment = layer.getSubLayer(1);

        // Let a user shift-click the map to find school districts.
        map.on('click', function (e) {
          console.log(e.latlng);
          if (e.originalEvent.shiftKey) {
            app.lat = e.latlng.lat;
            app.lng = e.latlng.lng;

            // reverse geocode to grab the selected address, then get results.
            app.reverseGeocode(app.findByLocation);
          }
        });

        // add a 'home' looking icon to represent the user's location
        if (app.lat && app.lng) {
          var marker = L.marker([app.lat, app.lng], {icon: app.geo.homeIcon, draggable: true})
                        .addTo(map)
                        .on('dragend', MapView.onMarkerDragEnd);
          if (app.config.showHomeHelpPopup) {
            marker.bindPopup("<b>Your location (draggable)</b>")
                  .openPopup();
          }
        }

        var hasCatchment = school.shape_area ? true : false;
        if (hasCatchment) {
          // zoom in to show the full catchment area
          app.sql.getBounds(that.catchmentsSQL).done(function (bounds) {
            that.map.fitBounds(bounds);
          });
        } else if (app.lat && app.lng) {
          // zoom to fit selected school + user location
          var southWest = L.latLng(school.latitude, school.longitude);
          var northEast = L.latLng(app.lat, app.lng);
          map.fitBounds(L.latLngBounds(southWest, northEast), {padding: [50, 50]});
        }
      })
      .error(function (err) {
        //log the error
        console.error(err); // TODO: console.XYZ needs definition on some older browsers
      });

    L.easyButton('fa-ship',
      function () {
        if (that.whereFilter === MapView.filters.distance) {
          that.whereFilter = undefined; // disable filter
        } else {
          that.whereFilter = MapView.filters.distance;
        }
        // that.whereFilter = "s.distance_education = true";

        that.loadNearby();
      },
      'Show only distance-education options',
      this.map
      );

    L.easyButton('fa-male',
      function () {
        if (that.whereFilter === MapView.filters.boys) {
          that.whereFilter = undefined; // disable filter
        } else {
          that.whereFilter = MapView.filters.boys;
        }
        that.loadNearby();
      },
      'Show only boys schools',
      this.map
      );

    L.easyButton('fa-female',
      function () {
        if (that.whereFilter === MapView.filters.girls) {
          that.whereFilter = undefined; // disable filter
        } else {
          that.whereFilter = MapView.filters.girls;
        }
        that.loadNearby();
      },
      'Show only girls schools',
      this.map
      );

    L.easyButton('fa-child',
      function () {
        if (that.whereFilter === MapView.filters.oshc) {
          that.whereFilter = undefined; // disable filter
        } else {
          that.whereFilter = MapView.filters.oshc;
        }
        that.loadNearby();
      },
      'Show only schools with Outside School Hours Care',
      this.map
      );

    L.easyButton('fa-bolt',
      function () {
        if (that.whereFilter === MapView.filters.difficult) {
          that.whereFilter = undefined; // disable filter
        } else {
          that.whereFilter = MapView.filters.difficult;
        }
        that.loadNearby();
      },
      'Show only selective or opportunity class schools',
      this.map
      );

    L.easyButton('fa-magic',
      function () {
        if (that.whereFilter === MapView.filters.specialty) {
          that.whereFilter = undefined; // disable filter
        } else {
          that.whereFilter = MapView.filters.specialty;
        }
        that.loadNearby();
      },
      'Show only specialty schools',
      this.map
      );


  };





}());