Build a single web page, index.html, in this folder that helps a non-statistician understand a regression on NYC 311 response times.

The data is requests.csv: one row per closed 311 request from one week, with borough, complaint_type (rare types grouped as "Other"), and days (days from opening to closing).

The page should:
- Show every borough as a column of dots, one dot per request (sample the dots if needed for speed, but compute everything from all rows), with each borough's average marked. Color "UNSANITARY CONDITION" requests differently and say so in a small legend.
- Show a small results panel: each borough's difference in average days compared with a comparison borough, and R², from an ordinary least squares regression of days on borough.
- Have a switch, "Add complaint type", that refits the regression with complaint type added and updates the differences and R². Show both versions' Bronx number side by side once the switch has been used.
- Have a menu to choose the comparison borough (default Manhattan).
- Before the switch can be used, ask the reader to type a prediction of what will happen to the Bronx number, and keep their prediction visible next to the result.
- Look plain: white background, black text, one ordinary sans-serif font, color only for the housing complaints and the Bronx. No animation.

It must work when opened directly from the disk (file://), so do not fetch requests.csv at runtime; build the data into the page or a script file next to it, in whatever compact form keeps the results exact.

Check your results. With Manhattan as the comparison, borough alone should give about Bronx +0.26, Brooklyn -0.36, Queens -1.16, Staten Island -0.86, R² about 0.010. With complaint type added: Bronx about -0.51, Brooklyn -0.31, Queens -0.30, Staten Island -0.66, R² about 0.481. Tell me what you checked.
