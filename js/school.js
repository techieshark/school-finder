var app, L;
app = app || {};

(function () {
  String.prototype.capitalize = String.prototype.capitalize || function () {
    return this.charAt(0).toUpperCase() + this.slice(1);
  };

  var yesNo = function (field) {
    if (field && field === 'Y') {
      return 'Yes';
    }
    return 'No';
  };

  /* create a new School. */
  app.School = function () {
  };

  app.School.toTemplateContext = function (fields, i) {
    return {
      resultNumber: i,
      description: fields.description,
      name: fields.school_name,
      address: fields.street,
      suburb: fields.town_suburb,
      postcode: fields.postcode,
      code: fields.school_code,
      phone: fields.phone,
      website: fields.website,
      level: function () {
        return app.level ? app.level.capitalize() : 'School';
      },
      grades: fields.subtype,
      selective: fields.selective_school,
      specialty: fields.school_specialty_type,
      preschool: yesNo(fields.preschool_indicator),
      oshc: fields.oshc, /* outside school hours care */
      distanceEd: fields.distance_education,
      intensiveEnglish: yesNo(fields.intensive_english_centre),
      latitude: fields.latitude,
      longitude: fields.longitude,
      established: function () {
        // try to return something human friendly if we can parse date.
        var d = new Date(fields.date_1st_teacher);
        if (d) { return d.getFullYear(); }
        return fields.date_1st_teacher;
      },
      email: fields.school_email,
      homeAddress: app.address,
      homeLat: app.lat,
      homeLng: app.lng,
      distance: function () {
        // We don't always have a user location
        // (e.g. if searching for a specific school)
        // That's OK, return nothing in that case.
        if (!app.lat || !app.lng) { return; }

        // function roundToTwo(num) {
        //   return +(Math.round(num + "e+2")  + "e-2");
        // }

        function roundToOne(num) {
          return +(Math.round(num + "e+1")  + "e-1");
        }

        var userLatLng = new L.latLng(app.lat, app.lng);
        var schoolLatLng = new L.latLng(fields.latitude, fields.longitude);
        var dist = userLatLng.distanceTo(schoolLatLng);

        // lookup distance along road network and insert it into page when the results come back.
        app.calculateRouteDistance(fields.latitude, fields.longitude, '#result-' + i + ' .route-distance');

        return "About " + roundToOne(dist / 1000) + " km";
      },
      opportunityClass: fields.opportunity_class
    };
  };

}());