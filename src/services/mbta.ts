/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Prediction {
  id: string;
  arrivalTime: string | null;
  departureTime: string | null;
  stopId: string;
  status: string | null;
  directionId: number;
}

export interface Route {
  id: string;
  name: string;
  color: string;
  textColor: string;
  directionNames: string[];
}

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export async function fetchRoutes(): Promise<Route[]> {
  // Filter for subway (0) and light rail (1)
  const url = `https://api-v3.mbta.com/routes?filter[type]=0,1`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch routes');
    const json = await response.json();
    return json.data.map((item: any) => ({
      id: item.id,
      name: item.attributes.long_name,
      color: `#${item.attributes.color}`,
      textColor: `#${item.attributes.text_color}`,
      directionNames: item.attributes.direction_names,
    }));
  } catch (error) {
    console.error('MBTA Routes Error:', error);
    return [];
  }
}

export async function fetchStops(routeId: string): Promise<Stop[]> {
  const url = `https://api-v3.mbta.com/stops?filter[route]=${routeId}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch stops');
    const json = await response.json();
    // Filter for parent stations to avoid duplicate platforms in the list
    return json.data
      .filter((item: any) => item.relationships.parent_station.data === null)
      .map((item: any) => ({
        id: item.id,
        name: item.attributes.name,
        latitude: item.attributes.latitude,
        longitude: item.attributes.longitude,
      }))
      .sort((a: Stop, b: Stop) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('MBTA Stops Error:', error);
    return [];
  }
}

export async function fetchAllSubwayStops(): Promise<(Stop & { routeIds: string[] })[]> {
  const url = `https://api-v3.mbta.com/stops?filter[route_type]=0,1`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch all stops');
    const json = await response.json();
    
    // Filter for parent stations to avoid duplicate platforms
    return json.data
      .filter((item: any) => item.relationships.parent_station.data === null)
      .map((item: any) => {
        const routeData = item.relationships.route?.data;
        let routeIds: string[] = [];
        if (Array.isArray(routeData)) {
          routeIds = routeData.map((r: any) => r.id);
        } else if (routeData && routeData.id) {
          routeIds = [routeData.id];
        }
        
        return {
          id: item.id,
          name: item.attributes.name,
          latitude: item.attributes.latitude,
          longitude: item.attributes.longitude,
          routeIds
        };
      });
  } catch (error) {
    console.error('MBTA All Stops Error:', error);
    return [];
  }
}

export async function fetchPredictionsForStop(stopId: string, directionId: number): Promise<Prediction[]> {
  // Filter by stop and direction. We'll also filter by route_type 0,1 (Subway/Light Rail) 
  // to avoid bus predictions at multi-modal stations like Fields Corner.
  const url = `https://api-v3.mbta.com/predictions?filter[stop]=${stopId}&filter[direction_id]=${directionId}&filter[route_type]=0,1&include=stop,trip,route`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch MBTA data');
    
    const json = await response.json();
    const data = json.data as any[];
    
    const predictions = data.map((item: any) => {
      const arrival = item.attributes.arrival_time;
      const departure = item.attributes.departure_time;
      
      return {
        id: item.id,
        // Use arrival time if available, otherwise departure time.
        // This is important for trains already at the station or terminal.
        arrivalTime: arrival || departure,
        departureTime: departure,
        stopId: item.relationships.stop.data.id,
        status: item.attributes.status,
        directionId: item.attributes.direction_id,
      };
    });

    // Sort manually to ensure nulls/missing times don't push active trains to the end
    return predictions
      .filter(p => p.arrivalTime !== null)
      .sort((a, b) => {
        const timeA = new Date(a.arrivalTime!).getTime();
        const timeB = new Date(b.arrivalTime!).getTime();
        return timeA - timeB;
      });
  } catch (error) {
    console.error('MBTA Fetch Error:', error);
    return [];
  }
}
