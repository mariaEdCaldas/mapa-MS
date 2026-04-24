import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapaMsComponent } from './mapa-ms.component';

describe('MapaMsComponent', () => {
  let component: MapaMsComponent;
  let fixture: ComponentFixture<MapaMsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MapaMsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MapaMsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
