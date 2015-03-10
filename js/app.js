var app, Map, L, cartodb, google, Handlebars;
app = app || {};

// CartoDB configuration
app.db = {
  points: 'dec_schools', //table
  polygons: 'catchments', //table
  user: 'cesensw'
};

// Map configuration variables
app.geo = {
  tiles: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
  //dark: https://dnv9my2eseobd.cloudfront.net/v3/cartodb.map-4xtxp73f/{z}/{x}/{y}.png'
  attribution: 'Mapbox <a href="https://mapbox.com/about/maps" target="_blank">Terms &amp; Feedback</a>',
  // CartoCSS for various map layers
  backgroundCSS: '{polygon-fill: #F0F0F0; polygon-opacity: 0; line-color: #7E599D; line-width: 0.3; line-opacity: 1; line-dasharray: 10,4;}',
  catchmentCSS: '{polygon-fill: #D0DAFF; polygon-opacity: 0.15; line-color: #426; line-width: 1; line-opacity: 1;}',
  schoolCSS: '{marker-fill: #D0DAFF;}',
};

app.maps = [];

String.prototype.capitalize = String.prototype.capitalize || function () {
  return this.charAt(0).toUpperCase() + this.slice(1);
};


$(document).ready(function () {

  var clickSchoolType = function (e) {
    e.preventDefault();
    app.level = e.data.level;
    // jump to the address search
    $('html, body').animate({
      scrollTop: $(".block-address").offset().top - 100 //HACK to center in window.
    }, 500);
  };

  $(".btn.primary").click({level: 'primary'}, clickSchoolType);
  $(".btn.secondary").click({level: 'secondary'}, clickSchoolType);

  $(".btn.search").click(function (e) {
    e.preventDefault();

    // Geocode address then show results
    app.geocodeAddress(app.getResults);

  });

  $("#address").keyup(function (event) {
    if (event.keyCode === 13) {
      $(".btn.search").click();
    }
  });

  app.sql = new cartodb.SQL({ user: app.db.user });

});


// update results for a specific lat/lng
app.getResults = function () {

  // clean up any previous result
  $('#results-container .result').remove();
  $('#results-container').empty();
  app.maps = [];

  var lat = app.lat;
  var lng = app.lng;

  app.sql.execute("SELECT b.school_code, s.* FROM " + app.db.polygons + " AS b JOIN " + app.db.points + " AS s ON b.school_code = s.school_code WHERE ST_CONTAINS(b.the_geom, ST_SetSRID(ST_Point(" + lng + "," + lat + "),4326)) AND b.school_type ~* '" + app.level + "'")
    .done(function (data) {
      var context, source, template, html, mapID, schoolsSQL, catchmentsSQL;
      if (data.rows.length < 1) {
        source = $("#no-result-template").html();
        template = Handlebars.compile(source);
        html = template();
        $('#results-container').html(html);

        mapID = 'cartodb-map-blank';
        schoolsSQL = "SELECT * FROM " + app.db.points + " WHERE 1 = 0";
        app.addMap(mapID, schoolsSQL);
      } else {
        data.rows.forEach(function (row, i) {
          var resultID = "result-" + i;
          mapID = "cartodb-map-" + i;
          $('#results-container').append('<div class="result" id="' + resultID + '"></div>');

          var level;
          if (app.level) {
            level = app.level.capitalize();
          } else {
            level = 'School';
          }

          var yesNo = function (field) {
            if (field && field === 'Y') {
              return 'Yes';
            }
            return 'No';
          };

          context = {
            resultNumber: i,
            name: row.school_name,
            address: row.street,
            suburb: row.town_suburb,
            postcode: row.postcode,
            code: row.school_code,
            phone: row.phone,
            level: level,
            grades: row.subtype,
            selective: row.selective_school,
            specialty: row.school_specialty_type,
            preschool: yesNo(row.preschool_indicator),
            distanceEd: row.distance_education,
            intensiveEnglish: yesNo(row.intensive_english_centre),
            established: function () {
              // try to return something human friendly if we can parse date.
              var d = new Date(row.date_1st_teacher);
              if (d) { return d.getFullYear(); }
              return row.date_1st_teacher;
            },
            email: row.school_email,
            homeAddress: app.address
          };

          source = $("#result-template").html();
          template = Handlebars.compile(source);
          html = template(context);
          var $result = $('#' + resultID);
          $result.html(html);

          schoolsSQL = "SELECT * FROM " + app.db.points + " WHERE school_code = '" + row.school_code + "'";
          catchmentsSQL = "SELECT * FROM " + app.db.polygons + " WHERE school_code = '" + row.school_code + "'";
          var map = app.addMap(mapID, schoolsSQL, catchmentsSQL);

          // Specify a Maki icon name, hex color, and size (s, m, or l).
          // An array of icon names can be found in L.MakiMarkers.icons or at https://www.mapbox.com/maki/
          // Lowercase letters a-z and digits 0-9 can also be used. A value of null will result in no icon.
          // Color may also be set to null, which will result in a gray marker.
          var icon = L.MakiMarkers.icon({icon: "school", color: "#b0b", size: "m"});
          L.marker([row.latitude, row.longitude], {icon: icon}).addTo(map.map);

          // scroll to first result
          if (i === 0) {
            $('html, body').animate({
              scrollTop: $result.offset().top
            }, 500);
          }
        });
      }
    });
};


app.addMap = function (id, schoolsSQL, catchmentsSQL) {

  catchmentsSQL = catchmentsSQL || "SELECT * FROM " + app.db.polygons + " WHERE ST_CONTAINS(the_geom, ST_SetSRID(ST_Point(" + app.lng + "," + app.lat + "),4326)) AND school_type ~* '" + app.level + "'";

  var m = new Map(id, schoolsSQL, catchmentsSQL);
  app.maps.push(m);
  return m;
};